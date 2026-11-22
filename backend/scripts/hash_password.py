"""Generate a bcrypt hash for ADMIN_PASSWORD_HASH / REVIEWER_PASSWORD_HASH.

Usage (prompts without echoing the password):
    python backend/scripts/hash_password.py
"""

import getpass
import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.security import hash_password


def main() -> int:
    """Prompt for a password twice and print its bcrypt hash."""
    password = getpass.getpass("Password: ")
    if not password:
        print("Password must not be empty.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match.", file=sys.stderr)
        return 1
    try:
        print(hash_password(password))
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
