"""
Test trip CRUD endpoints: GET, POST, PATCH, DELETE
"""
import pytest


class TestTrips:
    """Trip management tests"""

    def test_get_all_trips(self, base_url, api_client, auth_headers):
        """Test GET /trips returns seeded trips for authenticated user"""
        response = api_client.get(
            f"{base_url}/api/trips",
            headers=auth_headers
        )
        assert response.status_code == 200, f"GET /trips failed: {response.text}"
        
        trips = response.json()
        assert isinstance(trips, list), "Should return list of trips"
        assert len(trips) >= 3, f"Expected at least 3 seeded trips, got {len(trips)}"
        
        # Verify seeded trips are present
        trip_names = [t["name"] for t in trips]
        assert "Bangalore to Coorg" in trip_names
        assert "Manali to Leh" in trip_names
        assert "Spiti Loop — Open Invite" in trip_names

    def test_get_trips_by_status_planned(self, base_url, api_client, auth_headers):
        """Test GET /trips?status=planned filters correctly"""
        response = api_client.get(
            f"{base_url}/api/trips?status=planned",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        trips = response.json()
        assert len(trips) >= 2, "Should have at least 2 planned trips from seed"
        for trip in trips:
            assert trip["status"] == "planned"
        
        # Verify seeded planned trips are present
        trip_names = [t["name"] for t in trips]
        assert "Bangalore to Coorg" in trip_names
        assert "Spiti Loop — Open Invite" in trip_names

    def test_get_trips_by_status_completed(self, base_url, api_client, auth_headers):
        """Test GET /trips?status=completed filters correctly"""
        response = api_client.get(
            f"{base_url}/api/trips?status=completed",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        trips = response.json()
        assert len(trips) >= 1, "Should have at least 1 completed trip from seed"
        for trip in trips:
            assert trip["status"] == "completed"
        
        # Verify seeded completed trip is present
        trip_names = [t["name"] for t in trips]
        assert "Manali to Leh" in trip_names
        manali_trip = next(t for t in trips if t["name"] == "Manali to Leh")
        assert manali_trip["top_speed_kmh"] == 92

    def test_create_trip(self, base_url, api_client, auth_headers):
        """Test POST /trips creates new trip"""
        new_trip = {
            "name": "TEST_Mumbai to Goa",
            "start": {"name": "Mumbai", "lat": 19.0760, "lng": 72.8777},
            "end": {"name": "Goa", "lat": 15.2993, "lng": 74.1240},
            "waypoints": [],
            "distance_km": 580,
            "elevation_m": 650,
            "crew": ["Test Crew"],
            "notes": "Test trip",
            "is_public": False
        }
        
        response = api_client.post(
            f"{base_url}/api/trips",
            json=new_trip,
            headers=auth_headers
        )
        assert response.status_code == 200, f"POST /trips failed: {response.text}"
        
        trip = response.json()
        assert trip["name"] == new_trip["name"]
        assert trip["status"] == "planned"
        assert "id" in trip
        assert trip["distance_km"] == 580
        
        # Verify persistence with GET
        trip_id = trip["id"]
        get_response = api_client.get(
            f"{base_url}/api/trips/{trip_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        assert get_response.json()["name"] == new_trip["name"]

    def test_start_trip_updates_status(self, base_url, api_client, auth_headers):
        """Test PATCH /trips/{id} with status=active sets started_at"""
        # First create a trip
        new_trip = {
            "name": "TEST_Start Trip Test",
            "start": {"name": "Delhi", "lat": 28.6139, "lng": 77.2090},
            "end": {"name": "Jaipur", "lat": 26.9124, "lng": 75.7873},
            "distance_km": 280,
            "elevation_m": 0,
            "crew": [],
            "is_public": False
        }
        create_response = api_client.post(
            f"{base_url}/api/trips",
            json=new_trip,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        trip_id = create_response.json()["id"]
        
        # Start the trip
        patch_response = api_client.patch(
            f"{base_url}/api/trips/{trip_id}",
            json={"status": "active"},
            headers=auth_headers
        )
        assert patch_response.status_code == 200, f"PATCH failed: {patch_response.text}"
        
        updated_trip = patch_response.json()
        assert updated_trip["status"] == "active"
        assert updated_trip["started_at"] is not None, "started_at should be set"

    def test_complete_trip_updates_stats(self, base_url, api_client, auth_headers):
        """Test PATCH /trips/{id} with status=completed updates user stats"""
        # Get initial stats
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        initial_stats = me_response.json()["stats"]
        
        # Create and complete a trip
        new_trip = {
            "name": "TEST_Complete Trip Test",
            "start": {"name": "A", "lat": 28.0, "lng": 77.0},
            "end": {"name": "B", "lat": 29.0, "lng": 78.0},
            "distance_km": 150,
            "elevation_m": 0,
            "crew": [],
            "is_public": False
        }
        create_response = api_client.post(
            f"{base_url}/api/trips",
            json=new_trip,
            headers=auth_headers
        )
        trip_id = create_response.json()["id"]
        
        # Complete the trip
        patch_response = api_client.patch(
            f"{base_url}/api/trips/{trip_id}",
            json={
                "status": "completed",
                "actual_distance_km": 155.5,
                "top_speed_kmh": 85,
                "duration_min": 180
            },
            headers=auth_headers
        )
        assert patch_response.status_code == 200
        
        completed_trip = patch_response.json()
        assert completed_trip["status"] == "completed"
        assert completed_trip["ended_at"] is not None
        
        # Verify stats updated
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        new_stats = me_response.json()["stats"]
        assert new_stats["trips_completed"] == initial_stats["trips_completed"] + 1
        assert new_stats["total_km"] > initial_stats["total_km"]

    def test_get_trip_by_id(self, base_url, api_client, auth_headers):
        """Test GET /trips/{id} returns specific trip"""
        # Get all trips first
        list_response = api_client.get(f"{base_url}/api/trips", headers=auth_headers)
        trips = list_response.json()
        trip_id = trips[0]["id"]
        
        # Get specific trip
        response = api_client.get(
            f"{base_url}/api/trips/{trip_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        trip = response.json()
        assert trip["id"] == trip_id

    def test_get_nonexistent_trip(self, base_url, api_client, auth_headers):
        """Test GET /trips/{id} with invalid ID returns 404"""
        response = api_client.get(
            f"{base_url}/api/trips/nonexistent-id",
            headers=auth_headers
        )
        assert response.status_code == 404
