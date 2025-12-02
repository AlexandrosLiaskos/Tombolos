"""
Tombolos Web Map - FastAPI Backend
Serves the static frontend and provides API endpoints for tombolo data
"""

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import os

# Initialize FastAPI app
app = FastAPI(
    title="Tombolos Web Map",
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


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main index.html page"""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Tombolos Web Map</h1><p>Index file not found.</p>")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "app": "Tombolos Web Map"}


# Serve individual static files at root level for relative paths in HTML
@app.get("/styles.css")
async def serve_css():
    return FileResponse(os.path.join(STATIC_DIR, "styles.css"), media_type="text/css")

@app.get("/app.js")
async def serve_app_js():
    return FileResponse(os.path.join(STATIC_DIR, "app.js"), media_type="application/javascript")

@app.get("/config.js")
async def serve_config_js():
    return FileResponse(os.path.join(STATIC_DIR, "config.js"), media_type="application/javascript")

@app.get("/auth.js")
async def serve_auth_js():
    return FileResponse(os.path.join(STATIC_DIR, "auth.js"), media_type="application/javascript")

@app.get("/simple-dropdown-limit.js")
async def serve_dropdown_js():
    return FileResponse(os.path.join(STATIC_DIR, "simple-dropdown-limit.js"), media_type="application/javascript")

@app.get("/measurement-tool.js")
async def serve_measurement_js():
    return FileResponse(os.path.join(STATIC_DIR, "measurement-tool.js"), media_type="application/javascript")

@app.get("/favicon.svg")
async def favicon():
    return FileResponse(os.path.join(STATIC_DIR, "favicon.svg"), media_type="image/svg+xml")

@app.get("/favicon.ico")
async def favicon_ico():
    favicon_path = os.path.join(STATIC_DIR, "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path, media_type="image/x-icon")
    return FileResponse(os.path.join(STATIC_DIR, "favicon.svg"), media_type="image/svg+xml")


# Also mount static directory for any other files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
