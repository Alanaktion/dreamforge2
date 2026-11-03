"""Comments on entities and scenes, ported from src/lib/server/comments.ts."""

from typing import Any

from sqlmodel import Session, col, select

from ..models import Comment, Project, User
from ..utils import generate_id, iso_now
from .metadata import with_project_metadata


def _out(comment: Comment, username: str) -> dict[str, Any]:
    return {
        "id": comment.id,
        "project_id": comment.project_id,
        "target_type": comment.target_type,
        "target_id": comment.target_id,
        "user_id": comment.user_id,
        "username": username,
        "body": comment.body,
        "created_at": comment.created_at,
        "resolved": bool(comment.resolved),
    }


def get_comments(db: Session, project_id: str, target_type: str, target_id: str) -> list[dict]:
    rows = db.exec(
        select(Comment, User.username)
        .join(User, col(User.id) == Comment.user_id)
        .where(
            Comment.project_id == project_id,
            Comment.target_type == target_type,
            Comment.target_id == target_id,
        )
        .order_by(col(Comment.created_at))
    ).all()
    return [_out(c, username) for c, username in rows]


def create_comment(
    db: Session, project: Project, target_type: str, target_id: str, user: User, body: str
) -> dict[str, Any]:
    comment = Comment(
        id=generate_id(),
        project_id=project.id,
        target_type=target_type,
        target_id=target_id,
        user_id=user.id,
        body=body,
        created_at=iso_now(),
        resolved=False,
    )
    with_project_metadata(db, project, lambda: db.add(comment))
    return _out(comment, user.username)


def _find(db: Session, project_id: str, comment_id: str) -> Comment | None:
    return db.exec(
        select(Comment).where(Comment.id == comment_id, Comment.project_id == project_id)
    ).first()


def delete_comment(db: Session, project: Project, comment_id: str, user_id: str) -> bool:
    """Authors and the project owner may delete a comment."""

    def change() -> bool:
        comment = _find(db, project.id, comment_id)
        if comment is None or user_id not in (comment.user_id, project.user_id):
            return False
        db.delete(comment)
        return True

    return with_project_metadata(db, project, change)


def resolve_comment(db: Session, project: Project, comment_id: str, resolved: bool) -> bool:
    def change() -> bool:
        comment = _find(db, project.id, comment_id)
        if comment is None:
            return False
        comment.resolved = resolved
        db.add(comment)
        return True

    return with_project_metadata(db, project, change)
