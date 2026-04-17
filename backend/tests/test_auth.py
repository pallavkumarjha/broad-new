"""
Test authentication endpoints: register, login, /me
"""
import pytest
import uuid


class TestAuth:
    """Authentication flow tests"""

    def test_register_new_user(self, base_url, api_client):
        """Test user registration with new email"""
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": unique_email,
                "password": "testpass123",
                "name": "Test Rider"
            }
        )
        assert response.status_code == 200, f"Register failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Token missing in response"
        assert "user" in data, "User missing in response"
        assert data["user"]["email"] == unique_email
        assert data["user"]["name"] == "Test Rider"
        assert "bike" in data["user"]
        assert "emergency_contacts" in data["user"]
        assert "stats" in data["user"]

    def test_register_duplicate_email(self, base_url, api_client, test_user_credentials):
        """Test registration with existing email returns 400"""
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": test_user_credentials["email"],
                "password": "anypass",
                "name": "Duplicate"
            }
        )
        assert response.status_code == 400, "Should reject duplicate email"
        assert "already registered" in response.text.lower()

    def test_login_seeded_user(self, base_url, api_client, test_user_credentials):
        """Test login with seeded user rider@broad.app / rider123"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={
                "email": test_user_credentials["email"],
                "password": test_user_credentials["password"]
            }
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == test_user_credentials["email"]
        assert data["user"]["name"] == test_user_credentials["name"]
        
        # Verify seeded user has full profile
        user = data["user"]
        assert user["bike"]["make"] == "Royal Enfield"
        assert user["bike"]["model"] == "Himalayan 450"
        assert len(user["emergency_contacts"]) == 2
        assert user["emergency_contacts"][0]["name"] == "Priya Mehra"
        assert user["stats"]["total_km"] > 0
        assert user["stats"]["trips_completed"] >= 23  # At least 23 from seed
        assert user["stats"]["highest_point_m"] == 5359

    def test_login_invalid_credentials(self, base_url, api_client):
        """Test login with wrong password returns 401"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={
                "email": "rider@broad.app",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401, "Should reject invalid credentials"

    def test_get_me_with_token(self, base_url, api_client, auth_headers):
        """Test GET /auth/me returns user profile with Bearer token"""
        response = api_client.get(
            f"{base_url}/api/auth/me",
            headers=auth_headers
        )
        assert response.status_code == 200, f"GET /me failed: {response.text}"
        
        user = response.json()
        assert user["email"] == "rider@broad.app"
        assert user["name"] == "Arjun Mehra"
        assert "bike" in user
        assert "emergency_contacts" in user
        assert "stats" in user

    def test_get_me_without_token(self, base_url, api_client):
        """Test GET /auth/me without token returns 401"""
        response = api_client.get(f"{base_url}/api/auth/me")
        assert response.status_code == 401, "Should require authentication"
