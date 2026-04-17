"""
Test discover, convoy, and SOS endpoints
"""
import pytest


class TestDiscover:
    """Discover public trips tests"""

    def test_discover_returns_public_trips_only(self, base_url, api_client, auth_headers):
        """Test GET /trips/discover returns only public trips"""
        response = api_client.get(
            f"{base_url}/api/trips/discover",
            headers=auth_headers
        )
        assert response.status_code == 200, f"GET /trips/discover failed: {response.text}"
        
        trips = response.json()
        assert isinstance(trips, list)
        assert len(trips) == 1, f"Expected 1 public trip (Spiti Loop), got {len(trips)}"
        
        # Verify it's the Spiti Loop trip
        public_trip = trips[0]
        assert public_trip["name"] == "Spiti Loop — Open Invite"
        assert public_trip["is_public"] is True
        assert public_trip["status"] == "planned"
        assert public_trip["distance_km"] == 760
        assert public_trip["elevation_m"] == 4551


class TestConvoy:
    """Convoy (mocked) endpoint tests"""

    def test_get_convoy_for_trip(self, base_url, api_client, auth_headers):
        """Test GET /trips/{id}/convoy returns mocked convoy data"""
        # Get a seeded trip first
        trips_response = api_client.get(f"{base_url}/api/trips", headers=auth_headers)
        trips = trips_response.json()
        trip_id = trips[0]["id"]
        
        # Get convoy data
        response = api_client.get(
            f"{base_url}/api/trips/{trip_id}/convoy",
            headers=auth_headers
        )
        assert response.status_code == 200, f"GET convoy failed: {response.text}"
        
        convoy = response.json()
        assert "members" in convoy
        assert "spread_km" in convoy
        assert "updated_at" in convoy
        
        # Verify members structure
        members = convoy["members"]
        assert isinstance(members, list)
        assert len(members) > 0
        
        for member in members:
            assert "name" in member
            assert "lat" in member
            assert "lng" in member
            assert "speed_kmh" in member
            assert "fuel_pct" in member
            assert "position" in member
            assert member["position"] in ["lead", "ok", "sweep"]

    def test_convoy_nonexistent_trip(self, base_url, api_client, auth_headers):
        """Test GET convoy for nonexistent trip returns 404"""
        response = api_client.get(
            f"{base_url}/api/trips/nonexistent-id/convoy",
            headers=auth_headers
        )
        assert response.status_code == 404


class TestSOS:
    """SOS emergency endpoint tests"""

    def test_trigger_sos(self, base_url, api_client, auth_headers):
        """Test POST /sos creates active SOS event"""
        sos_data = {
            "trip_id": None,
            "lat": 28.6139,
            "lng": 77.2090,
            "speed_kmh": 45,
            "heading_deg": 180,
            "note": "Test SOS event"
        }
        
        response = api_client.post(
            f"{base_url}/api/sos",
            json=sos_data,
            headers=auth_headers
        )
        assert response.status_code == 200, f"POST /sos failed: {response.text}"
        
        sos_event = response.json()
        assert sos_event["status"] == "active"
        assert "id" in sos_event
        assert sos_event["lat"] == sos_data["lat"]
        assert sos_event["lng"] == sos_data["lng"]
        assert sos_event["speed_kmh"] == sos_data["speed_kmh"]
        assert "created_at" in sos_event
        assert sos_event["resolved_at"] is None

    def test_get_active_sos(self, base_url, api_client, auth_headers):
        """Test GET /sos/active returns active SOS event"""
        # Trigger a new SOS
        sos_data = {
            "lat": 12.9716,
            "lng": 77.5946,
            "speed_kmh": 0,
            "heading_deg": 0,
            "note": "Test active SOS"
        }
        create_response = api_client.post(
            f"{base_url}/api/sos",
            json=sos_data,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        
        # Get active SOS - should return at least one active SOS
        response = api_client.get(
            f"{base_url}/api/sos/active",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        active_sos = response.json()
        assert active_sos is not None, "Should have at least one active SOS"
        assert active_sos["status"] == "active"
        assert "id" in active_sos
        assert "lat" in active_sos
        assert "lng" in active_sos

    def test_resolve_sos(self, base_url, api_client, auth_headers):
        """Test POST /sos/{id}/resolve marks SOS as resolved"""
        # Create SOS
        sos_data = {
            "lat": 15.2993,
            "lng": 74.1240,
            "speed_kmh": 0,
            "heading_deg": 0,
            "note": "Test resolve SOS"
        }
        create_response = api_client.post(
            f"{base_url}/api/sos",
            json=sos_data,
            headers=auth_headers
        )
        sos_id = create_response.json()["id"]
        
        # Resolve SOS
        response = api_client.post(
            f"{base_url}/api/sos/{sos_id}/resolve",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Resolve SOS failed: {response.text}"
        
        resolved_sos = response.json()
        assert resolved_sos["status"] == "resolved"
        assert resolved_sos["resolved_at"] is not None
        
        # Verify GET /sos/active no longer returns this SOS
        # (it should return the most recent active one or None)
        active_response = api_client.get(
            f"{base_url}/api/sos/active",
            headers=auth_headers
        )
        active_sos = active_response.json()
        if active_sos:
            assert active_sos["id"] != sos_id, "Resolved SOS should not be active"

    def test_resolve_nonexistent_sos(self, base_url, api_client, auth_headers):
        """Test resolving nonexistent SOS returns 404"""
        response = api_client.post(
            f"{base_url}/api/sos/nonexistent-id/resolve",
            headers=auth_headers
        )
        assert response.status_code == 404
