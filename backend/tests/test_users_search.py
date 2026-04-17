"""
Test GET /api/users/search endpoint for crew search functionality (Round 3)
"""
import pytest
import uuid


class TestUsersSearch:
    """Test user search endpoint for crew invites"""

    @pytest.fixture(scope="class")
    def alice_user(self, base_url, api_client):
        """Create a second test user (Alice Demo) for cross-user search testing"""
        unique_email = f"alice_{uuid.uuid4().hex[:6]}@test.com"
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": unique_email,
                "password": "test123",
                "name": "Alice Demo"
            }
        )
        assert response.status_code == 200, f"Failed to create Alice user: {response.text}"
        data = response.json()
        return {
            "email": unique_email,
            "token": data["token"],
            "id": data["user"]["id"],
            "name": data["user"]["name"]
        }

    @pytest.fixture(scope="class")
    def pallav_user(self, base_url, api_client):
        """Create a third test user (Pallav) for search testing"""
        unique_email = f"pallav_{uuid.uuid4().hex[:6]}@test.com"
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": unique_email,
                "password": "test123",
                "name": "Pallav Kumar"
            }
        )
        assert response.status_code == 200, f"Failed to create Pallav user: {response.text}"
        data = response.json()
        return {
            "email": unique_email,
            "token": data["token"],
            "id": data["user"]["id"],
            "name": data["user"]["name"]
        }

    def test_search_requires_auth(self, base_url, api_client):
        """Test that search endpoint requires Bearer token"""
        response = api_client.get(f"{base_url}/api/users/search", params={"q": "test"})
        assert response.status_code == 401, "Should require authentication"

    def test_search_empty_query(self, base_url, api_client, auth_headers):
        """Test that empty query returns empty results"""
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": ""},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert data["results"] == []

    def test_search_short_query(self, base_url, api_client, auth_headers):
        """Test that query <2 chars returns empty results"""
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": "a"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert data["results"] == []

    def test_search_excludes_self(self, base_url, api_client, auth_headers):
        """Test that searching for own name (Arjun) excludes self"""
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": "arjun"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        # Should not include the logged-in user (Arjun Mehra)
        for result in data["results"]:
            assert result["email"] != "rider@broad.app", "Should exclude self from search results"

    def test_search_case_insensitive(self, base_url, api_client, auth_headers, alice_user):
        """Test that search is case-insensitive"""
        # Search for "alice" (lowercase)
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": "alice"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        
        # Should find Alice Demo
        alice_found = any(r["name"] == "Alice Demo" for r in data["results"])
        assert alice_found, "Should find Alice Demo with lowercase search"

        # Search for "ALICE" (uppercase)
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": "ALICE"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        alice_found = any(r["name"] == "Alice Demo" for r in data["results"])
        assert alice_found, "Should find Alice Demo with uppercase search"

    def test_search_returns_cross_user_results(self, base_url, api_client, auth_headers, alice_user, pallav_user):
        """Test that search returns other users (not self)"""
        # Search for "al" - should find Alice
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": "al"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert len(data["results"]) > 0, "Should return at least Alice"
        
        # Verify Alice is in results
        alice_found = any(r["name"] == "Alice Demo" for r in data["results"])
        assert alice_found, "Should find Alice Demo"

        # Search for "pallav" - should find Pallav
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": "pallav"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) > 0, "Should return Pallav"
        
        pallav_found = any(r["name"] == "Pallav Kumar" for r in data["results"])
        assert pallav_found, "Should find Pallav Kumar"

    def test_search_result_structure(self, base_url, api_client, auth_headers, alice_user):
        """Test that search results have correct structure (id, name, email)"""
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": "alice"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        
        if len(data["results"]) > 0:
            result = data["results"][0]
            assert "id" in result, "Result should have id"
            assert "name" in result, "Result should have name"
            assert "email" in result, "Result should have email"
            # Should NOT include password_hash or emergency_contacts
            assert "password_hash" not in result
            assert "emergency_contacts" not in result

    def test_search_limit_10_results(self, base_url, api_client, auth_headers):
        """Test that search returns max 10 results"""
        # Search for common letter that might match many users
        response = api_client.get(
            f"{base_url}/api/users/search",
            params={"q": "te"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert len(data["results"]) <= 10, "Should return max 10 results"
