"""Command-line tools that work without starting the server.

    dreamforge migrate
    dreamforge user add --email ada@example.com --username ada [--admin] [--password PW]
    dreamforge user reset-password <email or username> [--password PW]

Run them with ``uv run dreamforge ...`` from backend/, or ``python -m dreamforge_api ...``.
They honour DATABASE_PATH, like the server, and apply pending migrations first.
"""

import argparse
import sys

from sqlmodel import Session

from .config import get_settings
from .db import get_engine, raw_connect
from .migrate import migrate, user_version
from .services import accounts


def _migrate(args: argparse.Namespace) -> int:
    conn = raw_connect()
    try:
        before = user_version(conn)
        migrate(conn)
        after = user_version(conn)
    finally:
        conn.close()
    path = get_settings().database_path
    if before == after:
        print(f"{path} is up to date (schema v{after}).")
    else:
        print(f"Migrated {path} from schema v{before} to v{after}.")
    return 0


def _user_add(args: argparse.Namespace) -> int:
    migrate()
    with Session(get_engine()) as db:
        generated = args.password is None
        password = args.password or accounts.generate_temporary_password()
        accounts.create_user(
            db,
            email=args.email,
            username=args.username,
            password=password,
            is_admin=args.admin,
            must_change_password=generated,
        )
    kind = "administrator" if args.admin else "user"
    print(
        f"Created {kind} {args.username.strip()} <{args.email.strip().lower()}>"
        f" in {get_settings().database_path}."
    )
    if generated:
        print(f"Temporary password (must be changed at first sign-in): {password}")
    return 0


def _user_reset(args: argparse.Namespace) -> int:
    migrate()
    with Session(get_engine()) as db:
        user = accounts.find_user(db, args.identifier)
        if user is None:
            raise accounts.AccountError(f'No user with email or username "{args.identifier}"')
        who = f"{user.username} <{user.email}>"
        disabled = user.disabled
        if args.password is not None:
            accounts.set_password(db, user.id, args.password)
            print(f"Password updated for {who}. Existing sessions were signed out.")
        else:
            temporary = accounts.reset_password(db, user.id)
            print(f"Password reset for {who}. Existing sessions were signed out.")
            print(f"Temporary password (must be changed at next sign-in): {temporary}")
        if disabled:
            print("Note: this account is disabled; re-enable it from the admin page.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dreamforge", description="DreamForge admin tools")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("migrate", help="apply database migrations").set_defaults(run=_migrate)

    user = commands.add_parser("user", help="manage accounts")
    user_commands = user.add_subparsers(dest="user_command", required=True)
    add = user_commands.add_parser("add", help="create an account")
    add.add_argument("--email", required=True)
    add.add_argument("--username", required=True)
    add.add_argument("--admin", action="store_true", help="make an instance administrator")
    add.add_argument("--password", help="set this password (otherwise a temporary one)")
    add.set_defaults(run=_user_add)

    reset = user_commands.add_parser(
        "reset-password", help="reset a password and sign the user out everywhere"
    )
    reset.add_argument("identifier", help="email or username")
    reset.add_argument("--password", help="set this password (otherwise a temporary one)")
    reset.set_defaults(run=_user_reset)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.run(args)
    except accounts.AccountError as err:
        print(err, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
