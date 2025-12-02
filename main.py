"""
Greek Tombolos Web Map - FastAPI Backend
Serves the static frontend and provides API endpoints for tombolo data
"""

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import os

# Initialize FastAPI app
app = FastAPI(
    title="Greek Tombolos Web Map",
    description="Interactive map exploring tombolos in Greece and their vulnerability to sea level rise",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get the directory where main.py is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main index.html page"""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Greek Tombolos Web Map</h1><p>Index file not found.</p>")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "app": "Greek Tombolos Web Map"}


@app.get("/favicon.svg")
async def favicon():
    """Serve favicon"""
    favicon_path = os.path.join(STATIC_DIR, "favicon.svg")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path, media_type="image/svg+xml")
    return {"error": "Favicon not found"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
