#!/usr/bin/env python3
"""
Shared Google Drive helpers for the scheduled summary scripts.

GUARDRAILS, by design and not merely by convention:
  * The only outbound network calls in this package go to the Google Drive API.
  * Nothing here moves money, files anything with any court or agency, sends
    mail, or contacts any person.
  * Nothing is scraped from the web. Every fact in an output file comes from a
    Drive file that a bot already saved.
  * Each run reads Drive and writes exactly one markdown file.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload

SCOPES = ["https://www.googleapis.com/auth/drive"]

FOLDER_MIME = "application/vnd.google-apps.folder"
DOC_MIME = "application/vnd.google-apps.document"
SHEET_MIME = "application/vnd.google-apps.spreadsheet"

HERE = Path(__file__).resolve().parent


def load_config(path: str | None = None) -> dict:
    target = Path(path) if path else HERE / "config.json"
    with open(target, encoding="utf-8") as fh:
        return json.load(fh)


def get_service(cfg: dict):
    """Build a Drive client from an already-authorized token.

    A cron run cannot answer an OAuth prompt. The first authorization must be
    done once, by hand, on the machine that will host the cron job.
    """
    token_path = Path(os.path.expanduser(cfg["auth"]["token_path"]))
    client_path = Path(os.path.expanduser(cfg["auth"]["client_secret_path"]))

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not client_path.exists():
                raise SystemExit(
                    "No usable Google credentials.\n"
                    f"  Expected a refreshable token at: {token_path}\n"
                    f"  or an OAuth client secret at:    {client_path}\n"
                    "Authorize once interactively before scheduling; cron cannot prompt."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(client_path), SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")
        os.chmod(token_path, 0o600)

    return build("drive", "v3", credentials=creds, cache_discovery=False)


def latest_file(service, folder_id: str, skip_name_contains=()) -> dict | None:
    """Return the most recently modified non-folder file in a folder.

    Returns None when the folder is empty or unreadable-as-empty. Callers must
    treat None as 'no data', never as an excuse to substitute anything.
    """
    resp = (
        service.files()
        .list(
            q=f"'{folder_id}' in parents and trashed = false",
            orderBy="modifiedTime desc",
            pageSize=50,
            fields="files(id,name,mimeType,modifiedTime,webViewLink)",
        )
        .execute()
    )
    for f in resp.get("files", []):
        if f["mimeType"] == FOLDER_MIME:
            continue
        if any(s.lower() in f["name"].lower() for s in skip_name_contains):
            continue
        return f
    return None


def fetch_text(service, file_id: str, mime_type: str) -> str | None:
    """Read a Drive file as text. Returns None for formats with no text form."""
    if mime_type == DOC_MIME:
        data = service.files().export(fileId=file_id, mimeType="text/plain").execute()
    elif mime_type == SHEET_MIME:
        data = service.files().export(fileId=file_id, mimeType="text/csv").execute()
    elif mime_type.startswith("application/vnd.google-apps"):
        return None
    else:
        data = service.files().get_media(fileId=file_id).execute()
    if isinstance(data, str):
        return data
    return data.decode("utf-8", errors="replace")


def write_markdown(service, folder_id: str, filename: str, body: str) -> dict:
    """Create the day's summary, or update it in place if today's already exists.

    Updating rather than duplicating means a re-run corrects the day's file
    instead of leaving two versions for the Chief of Staff to reconcile.
    """
    media = MediaInMemoryUpload(body.encode("utf-8"), mimetype="text/markdown")
    existing = (
        service.files()
        .list(
            q=f"'{folder_id}' in parents and name = '{filename}' and trashed = false",
            pageSize=1,
            fields="files(id,name,webViewLink)",
        )
        .execute()
        .get("files", [])
    )
    if existing:
        return (
            service.files()
            .update(fileId=existing[0]["id"], media_body=media,
                    fields="id,name,webViewLink")
            .execute()
        )
    return (
        service.files()
        .create(
            body={"name": filename, "parents": [folder_id], "mimeType": "text/markdown"},
            media_body=media,
            fields="id,name,webViewLink",
        )
        .execute()
    )
