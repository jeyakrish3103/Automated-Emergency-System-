"""Single FastAPI entrypoint. Vercel's current Python runtime bundles a whole
FastAPI app into one function -- it no longer treats each api/*.py file as an
independent function the way older tutorials describe. Each route still lives
in its own file as an APIRouter; this file just mounts them all.

Pointed to by pyproject.toml's [tool.vercel] entrypoint = "backend.api.index:app".

The frontend lives in frontend/public, not the Vercel-conventional root-level
public/, so it's served explicitly via a StaticFiles mount below instead of
relying on Vercel's automatic public/ detection.
"""
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.api.alert import router as alert_router
from backend.api.alert_detail import router as alert_detail_router
from backend.api.alerts import router as alerts_router
from backend.api.checkin import router as checkin_router
from backend.api.stations import router as stations_router

app = FastAPI()

app.include_router(alert_router)
app.include_router(alerts_router)
app.include_router(alert_detail_router)
app.include_router(checkin_router)
app.include_router(stations_router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/reporter.html")


# Registered last so /api/* and the root redirect above are matched first --
# only unmatched paths (reporter.html, style.css, ...) fall through to this.
app.mount("/", StaticFiles(directory="frontend/public"), name="frontend")
