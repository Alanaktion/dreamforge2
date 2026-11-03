from dreamforge_api.passwords import hash_password, verify_password

# Made by src/lib/server/password.ts (Node's crypto.scrypt) for the password below.
NODE_HASH = (
    "7U5FZAjHSlIV6/S8aPUR3XpZplxy538Ymx3o8nAbsjY=:"
    "YzOizLg6nk4rA8dDMyu9usvAXMkod9DPUu32eeARGDnMYo9W9hgTewKXvVFa/rqLS5CoynFKqOBcKo0IcT7CoA=="
)
NODE_PASSWORD = "Ünïcödé pässwörd ﬁ"


def test_verifies_hash_made_by_node():
    assert verify_password(NODE_PASSWORD, NODE_HASH)
    assert not verify_password("wrong", NODE_HASH)


def test_normalises_like_node():
    # NFKC turns the "ﬁ" ligature into "fi", as Node's password.normalize('NFKC') does.
    assert verify_password(NODE_PASSWORD.replace("ﬁ", "fi"), NODE_HASH)


def test_round_trip_and_format():
    hashed = hash_password("correct horse")
    salt, key = hashed.split(":")
    assert len(salt) == 44 and len(key) == 88  # 32 and 64 bytes, base64
    assert verify_password("correct horse", hashed)
    assert hash_password("correct horse") != hashed


def test_rejects_malformed_hashes():
    for bad in ("", "not-a-hash", ":", "abc:", "!!!:???"):
        assert not verify_password("password", bad)


def test_lone_surrogate_matches_node():
    # Node encodes a lone surrogate as U+FFFD; JSON can carry one ("\ud800").
    assert verify_password("a\ud800b", hash_password("a\ufffdb"))
