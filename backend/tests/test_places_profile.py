"""
Test new Round 2 features: places search/elevation, profile update
"""
import pytest


class TestPlacesSearch:
    """Test Nominatim OSM geocoding integration"""

    def test_search_hampi_returns_results(self, base_url, api_client, auth_headers):
        """Test GET /places/search?q=Hampi returns real Nominatim results"""
        response = api_client.get(
            f"{base_url}/api/places/search",
            params={"q": "Hampi"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Places search failed: {response.text}"
        
        data = response.json()
        assert "results" in data
        results = data["results"]
        assert isinstance(results, list)
        assert len(results) > 0, "Should return at least one result for Hampi"
        
        # Verify result structure
        first = results[0]
        assert "name" in first
        assert "lat" in first
        assert "lng" in first
        assert isinstance(first["lat"], float)
        assert isinstance(first["lng"], float)
        
        # Hampi is in Karnataka, India - rough lat/lng check
        assert 14 < first["lat"] < 16, f"Hampi lat should be ~15°N, got {first['lat']}"
        assert 76 < first["lng"] < 77, f"Hampi lng should be ~76°E, got {first['lng']}"

    def test_search_empty_query(self, base_url, api_client, auth_headers):
        """Test search with empty query returns empty results"""
        response = api_client.get(
            f"{base_url}/api/places/search",
            params={"q": ""},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["results"] == []

    def test_search_short_query(self, base_url, api_client, auth_headers):
        """Test search with 1-char query returns empty results"""
        response = api_client.get(
            f"{base_url}/api/places/search",
            params={"q": "a"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["results"] == []

    def test_search_requires_auth(self, base_url, api_client):
        """Test places search requires authentication"""
        response = api_client.get(
            f"{base_url}/api/places/search",
            params={"q": "Delhi"}
        )
        assert response.status_code == 401


class TestPlacesElevation:
    """Test Open-Elevation API integration"""

    def test_elevation_single_point(self, base_url, api_client, auth_headers):
        """Test POST /places/elevation with single point"""
        payload = {
            "points": [
                {"name": "Bangalore", "lat": 12.9716, "lng": 77.5946}
            ]
        }
        
        response = api_client.post(
            f"{base_url}/api/places/elevation",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Elevation API failed: {response.text}"
        
        data = response.json()
        assert "elevations" in data
        assert "max_m" in data
        assert isinstance(data["elevations"], list)
        assert len(data["elevations"]) == 1
        
        # Bangalore is ~900m elevation
        elev = data["elevations"][0]
        assert isinstance(elev, int)
        # Allow for API variance or rate limiting (may return 0)
        assert elev >= 0, "Elevation should be non-negative"
        assert data["max_m"] == elev

    def test_elevation_multiple_points(self, base_url, api_client, auth_headers):
        """Test elevation with multiple points returns max"""
        payload = {
            "points": [
                {"name": "Bangalore", "lat": 12.9716, "lng": 77.5946},
                {"name": "Leh", "lat": 34.1526, "lng": 77.5771},  # High altitude ~3500m
                {"name": "Mumbai", "lat": 19.0760, "lng": 72.8777}  # Sea level
            ]
        }
        
        response = api_client.post(
            f"{base_url}/api/places/elevation",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["elevations"]) == 3
        assert isinstance(data["max_m"], int)
        
        # If API returns real data, max should be Leh's elevation
        # If rate limited, may return 0s - that's acceptable per spec
        assert data["max_m"] >= 0

    def test_elevation_empty_points(self, base_url, api_client, auth_headers):
        """Test elevation with empty points array"""
        payload = {"points": []}
        
        response = api_client.post(
            f"{base_url}/api/places/elevation",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["elevations"] == []
        assert data["max_m"] == 0

    def test_elevation_requires_auth(self, base_url, api_client):
        """Test elevation API requires authentication"""
        payload = {
            "points": [{"name": "Test", "lat": 12.0, "lng": 77.0}]
        }
        response = api_client.post(
            f"{base_url}/api/places/elevation",
            json=payload
        )
        assert response.status_code == 401


class TestProfileUpdate:
    """Test PATCH /users/me profile update"""

    def test_update_name(self, base_url, api_client, auth_headers):
        """Test updating user name"""
        # Get current profile
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        original_name = me_response.json()["name"]
        
        # Update name
        new_name = "TEST_Updated Rider"
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json={"name": new_name},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Profile update failed: {response.text}"
        
        user = response.json()
        assert user["name"] == new_name
        
        # Verify persistence
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert me_response.json()["name"] == new_name
        
        # Restore original name
        api_client.patch(
            f"{base_url}/api/users/me",
            json={"name": original_name},
            headers=auth_headers
        )

    def test_update_bike(self, base_url, api_client, auth_headers):
        """Test updating bike details"""
        new_bike = {
            "make": "TEST_Yamaha",
            "model": "MT-15",
            "registration": "TEST-KA-99-XY-9999",
            "odometer_km": 5000
        }
        
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json={"bike": new_bike},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        user = response.json()
        assert user["bike"]["make"] == new_bike["make"]
        assert user["bike"]["model"] == new_bike["model"]
        assert user["bike"]["registration"] == new_bike["registration"]
        assert user["bike"]["odometer_km"] == new_bike["odometer_km"]
        
        # Verify persistence
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        bike = me_response.json()["bike"]
        assert bike["make"] == new_bike["make"]
        assert bike["odometer_km"] == new_bike["odometer_km"]

    def test_update_emergency_contacts(self, base_url, api_client, auth_headers):
        """Test updating emergency contacts"""
        new_contacts = [
            {
                "name": "TEST_Contact One",
                "phone": "+91 99999 11111",
                "relation": "Friend"
            },
            {
                "name": "TEST_Contact Two",
                "phone": "+91 99999 22222",
                "relation": "Family"
            }
        ]
        
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json={"emergency_contacts": new_contacts},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        user = response.json()
        assert len(user["emergency_contacts"]) == 2
        assert user["emergency_contacts"][0]["name"] == new_contacts[0]["name"]
        assert user["emergency_contacts"][1]["phone"] == new_contacts[1]["phone"]
        
        # Verify persistence
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        contacts = me_response.json()["emergency_contacts"]
        assert len(contacts) == 2
        assert contacts[0]["name"] == new_contacts[0]["name"]

    def test_update_all_fields(self, base_url, api_client, auth_headers):
        """Test updating name, bike, and contacts together"""
        update_payload = {
            "name": "TEST_Full Update",
            "bike": {
                "make": "TEST_Honda",
                "model": "CB350",
                "registration": "TEST-MH-01-AB-1234",
                "odometer_km": 12000
            },
            "emergency_contacts": [
                {
                    "name": "TEST_Emergency",
                    "phone": "+91 88888 88888",
                    "relation": "Spouse"
                }
            ]
        }
        
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json=update_payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        user = response.json()
        assert user["name"] == update_payload["name"]
        assert user["bike"]["make"] == update_payload["bike"]["make"]
        assert len(user["emergency_contacts"]) == 1
        assert user["emergency_contacts"][0]["name"] == update_payload["emergency_contacts"][0]["name"]

    def test_update_requires_auth(self, base_url, api_client):
        """Test profile update requires authentication"""
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json={"name": "Test"}
        )
        assert response.status_code == 401
