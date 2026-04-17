import pytest
import requests
import os
from pathlib import Path


@pytest.fixture(scope="session")
def base_url():
    """Get backend URL from environment"""
    # Try EXPO_PUBLIC_BACKEND_URL first (from environment), then fallback to frontend env file
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if not url:
        # Read from frontend/.env
        frontend_env = Path(__file__).parent.parent.parent / "frontend" / ".env"
        if frontend_env.exists():
            with open(frontend_env) as f:
                for line in f:
                    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"')
                        break
    if not url:
        pytest.fail("EXPO_PUBLIC_BACKEND_URL not set in environment or frontend/.env")
    return url.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def test_user_credentials():
    """Seeded test user credentials"""
    return {
        "email": "rider@broad.app",
        "password": "rider123",
        "name": "Arjun Mehra"
    }


@pytest.fixture(scope="session")
def auth_token(base_url, api_client, test_user_credentials):
    """Get auth token for seeded test user"""
    response = api_client.post(
        f"{base_url}/api/auth/login",
        json={
            "email": test_user_credentials["email"],
            "password": test_user_credentials["password"]
        }
    )
    if response.status_code != 200:
        pytest.fail(f"Failed to login test user: {response.status_code} {response.text}")
    data = response.json()
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    """Headers with Bearer token"""
    return {"Authorization": f"Bearer {auth_token}"}
