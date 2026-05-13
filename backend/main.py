"""Project Raseed — FastAPI entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import gst, finance, invoices, compliance, communication
