"""DreamForge API server.

The FastAPI backend that is replacing SvelteKit's server modules (src/lib/server). It
shares the same SQLite database and project data directory, so both can run side by side
while endpoints move over.
"""
