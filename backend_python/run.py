"""Entry point: `python run.py` starts the Metheriel API on :8080."""

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8080,
        log_level="info",
        reload=False,
    )
