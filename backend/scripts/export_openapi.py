"""Script to export OpenAPI specification from FastAPI application."""

import json
import sys
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app


def export_openapi(output_path: Path) -> None:
    """Export the OpenAPI schema to the target path."""
    openapi_schema = app.openapi()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(openapi_schema, f, indent=2)
    print(f"Exported OpenAPI schema to {output_path}")


if __name__ == "__main__":
    target = backend_dir / "openapi.json"
    if len(sys.argv) > 1:
        target = Path(sys.argv[1])
    export_openapi(target)
