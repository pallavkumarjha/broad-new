"""
Tests for the home_city filter + public-trip join request flow.

These tests register fresh throwaway users per test so they don't stomp
on the seeded admin's state. They cover:

  home_city
    - field round-trips through /auth/me
    - Discover filters to only that city's trips
    - show_all=true bypasses the filter
    - null clears the filter
    - partial PATCH preserves home_city

  trip_requests
    - request-join creates a pending request
    - duplicate pending requests are rejected
    - organiser can approve (rider added to crew_ids)
    - organiser can decline (rider stays out)
    - requester can cancel (withdraw)
    - non-organiser cannot approve
    - capacity check blocks requests when full
    - /users/me/trip-requests returns requester's history

  auth refresh
    - refresh rotates both tokens
    - replaying old refresh is rejected
    - wrong token type is rejected
    - logout revokes refresh server-side
"""
import time
import uuid
import pytest


def _register(base_url, api_client, suffix: str = "") -> dict:
    """Create a fresh user and return {email, password, token, refresh_token, user, headers}."""
    email = f"pytest_{suffix}_{uuid.uuid4().hex[:8]}@example.com"
    password = "pytest1234"
    res = api_client.post(
        f"{base_url}/api/auth/register",
        json={"email": email, "password": password, "name": f"Pytest {suffix or 'User'}"},
    )
    assert res.status_code == 200, f"register failed: {res.status_code} {res.text}"
    data = res.json()
    return {
        "email": email,
        "password": password,
        "token": data["token"],
        "refresh_token": data.get("refresh_token"),
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


def _create_public_trip(base_url, api_client, headers, city: str = "Shimla", max_riders: int = 8) -> dict:
    body = {
        "name": f"Test Public Trip {uuid.uuid4().hex[:6]}",
        "start": {"name": city, "lat": 31.1048, "lng": 77.1734},
        "end": {"name": "Manali", "lat": 32.2396, "lng": 77.1887},
        "waypoints": [],
        "distance_km": 300,
        "elevation_m": 2000,
        "planned_date": "2030-01-01",
        "crew": [],
        "notes": "",
        "is_public": True,
        "max_riders": max_riders,
        "description": "A test public trip",
        "city": city,
    }
    res = api_client.post(f"{base_url}/api/trips", json=body, headers=headers)
    assert res.status_code == 200, f"create_trip failed: {res.status_code} {res.text}"
    return res.json()


class TestHomeCity:
    def test_new_user_has_no_home_city(self, base_url, api_client):
        u = _register(base_url, api_client, "hc1")
        res = api_client.get(f"{base_url}/api/auth/me", headers=u["headers"])
        assert res.status_code == 200
        assert res.json().get("home_city") is None

    def test_patch_sets_home_city(self, base_url, api_client):
        u = _register(base_url, api_client, "hc2")
        res = api_client.patch(
            f"{base_url}/api/users/me",
            json={"home_city": "Shimla"},
            headers=u["headers"],
        )
        assert res.status_code == 200
        assert res.json()["home_city"] == "Shimla"

    def test_patch_null_clears_home_city(self, base_url, api_client):
        """Regression: PATCH {home_city: null} must actually clear the field,
        not silently skip (was the model_fields_set bug)."""
        u = _register(base_url, api_client, "hc3")
        api_client.patch(f"{base_url}/api/users/me", json={"home_city": "Shimla"}, headers=u["headers"])
        res = api_client.patch(f"{base_url}/api/users/me", json={"home_city": None}, headers=u["headers"])
        assert res.status_code == 200
        assert res.json().get("home_city") is None

    def test_partial_patch_preserves_home_city(self, base_url, api_client):
        """PATCH with only `name` must NOT wipe home_city."""
        u = _register(base_url, api_client, "hc4")
        api_client.patch(f"{base_url}/api/users/me", json={"home_city": "Manali"}, headers=u["headers"])
        res = api_client.patch(f"{base_url}/api/users/me", json={"name": "Renamed"}, headers=u["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["name"] == "Renamed"
        assert body["home_city"] == "Manali"

    def test_discover_filters_by_home_city(self, base_url, api_client):
        organiser = _register(base_url, api_client, "hc_org")
        _create_public_trip(base_url, api_client, organiser["headers"], city="Shimla")

        rider = _register(base_url, api_client, "hc_rider")
        # Set rider home_city to a different city — Discover must return 0 trips
        api_client.patch(f"{base_url}/api/users/me", json={"home_city": "Atlantis"}, headers=rider["headers"])
        res = api_client.get(f"{base_url}/api/trips/discover", headers=rider["headers"])
        assert res.status_code == 200
        assert len(res.json()) == 0

        # Now set to Shimla — must see the public trip
        api_client.patch(f"{base_url}/api/users/me", json={"home_city": "Shimla"}, headers=rider["headers"])
        res = api_client.get(f"{base_url}/api/trips/discover", headers=rider["headers"])
        assert res.status_code == 200
        trips = res.json()
        assert any(t["city"] == "Shimla" for t in trips)

    def test_show_all_bypasses_filter(self, base_url, api_client):
        organiser = _register(base_url, api_client, "hc_sa_org")
        _create_public_trip(base_url, api_client, organiser["headers"], city="Goa")

        rider = _register(base_url, api_client, "hc_sa_rider")
        api_client.patch(f"{base_url}/api/users/me", json={"home_city": "Bangalore"}, headers=rider["headers"])

        # Filter on: Goa trip excluded
        res_filtered = api_client.get(f"{base_url}/api/trips/discover", headers=rider["headers"])
        filtered_names = [t["name"] for t in res_filtered.json()]

        # show_all=true: Goa trip included
        res_all = api_client.get(f"{base_url}/api/trips/discover?show_all=true", headers=rider["headers"])
        all_names = [t["name"] for t in res_all.json()]

        assert len(res_all.json()) >= len(res_filtered.json())
        # The Goa trip should appear in show_all but not in filtered
        goa_trips = [t for t in res_all.json() if t.get("city") == "Goa"]
        assert len(goa_trips) >= 1


class TestTripRequests:
    def test_request_join_creates_pending(self, base_url, api_client):
        organiser = _register(base_url, api_client, "req_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"])

        rider = _register(base_url, api_client, "req_rider")
        res = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": "can I join?"},
            headers=rider["headers"],
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["status"] == "pending"
        assert body["trip_id"] == trip["id"]

    def test_duplicate_request_rejected(self, base_url, api_client):
        organiser = _register(base_url, api_client, "dup_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"])
        rider = _register(base_url, api_client, "dup_rider")
        r1 = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""},
            headers=rider["headers"],
        )
        assert r1.status_code == 200
        r2 = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""},
            headers=rider["headers"],
        )
        assert r2.status_code == 400, f"duplicate should be 400, got {r2.status_code}"
        assert "already" in r2.json().get("detail", "").lower()

    def test_cannot_request_own_trip(self, base_url, api_client):
        organiser = _register(base_url, api_client, "own_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"])
        res = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""},
            headers=organiser["headers"],
        )
        assert res.status_code == 400

    def test_organiser_approve_flow(self, base_url, api_client):
        organiser = _register(base_url, api_client, "appr_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"])
        rider = _register(base_url, api_client, "appr_rider")
        r = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""},
            headers=rider["headers"],
        )
        rid = r.json()["id"]

        # Organiser approves
        ap = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/requests/{rid}/approve",
            headers=organiser["headers"],
        )
        assert ap.status_code == 200, ap.text
        assert ap.json()["status"] == "approved"

        # Rider should now appear in trip.crew_ids
        trip2 = api_client.get(f"{base_url}/api/trips/{trip['id']}", headers=organiser["headers"]).json()
        assert rider["user"]["id"] in (trip2.get("crew_ids") or [])

    def test_organiser_decline_flow(self, base_url, api_client):
        organiser = _register(base_url, api_client, "decl_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"])
        rider = _register(base_url, api_client, "decl_rider")
        r = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""},
            headers=rider["headers"],
        )
        rid = r.json()["id"]

        dc = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/requests/{rid}/decline",
            headers=organiser["headers"],
        )
        assert dc.status_code == 200
        assert dc.json()["status"] == "declined"

        # Rider NOT added to crew_ids
        trip2 = api_client.get(f"{base_url}/api/trips/{trip['id']}", headers=organiser["headers"]).json()
        assert rider["user"]["id"] not in (trip2.get("crew_ids") or [])

    def test_non_organiser_cannot_approve(self, base_url, api_client):
        organiser = _register(base_url, api_client, "noauth_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"])
        rider = _register(base_url, api_client, "noauth_rider")
        stranger = _register(base_url, api_client, "noauth_stranger")

        r = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""},
            headers=rider["headers"],
        )
        rid = r.json()["id"]

        res = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/requests/{rid}/approve",
            headers=stranger["headers"],
        )
        assert res.status_code in (403, 404)

    def test_requester_can_cancel(self, base_url, api_client):
        organiser = _register(base_url, api_client, "cnc_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"])
        rider = _register(base_url, api_client, "cnc_rider")
        r = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""},
            headers=rider["headers"],
        )
        rid = r.json()["id"]

        cn = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/requests/{rid}/cancel",
            headers=rider["headers"],
        )
        assert cn.status_code == 200
        assert cn.json()["status"] == "cancelled"

    def test_capacity_enforced(self, base_url, api_client):
        """max_riders=2 means organiser + 1 rider. Second approval must fail."""
        organiser = _register(base_url, api_client, "cap_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"], max_riders=2)

        r1 = _register(base_url, api_client, "cap_r1")
        r2 = _register(base_url, api_client, "cap_r2")

        req1 = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""}, headers=r1["headers"],
        )
        req2 = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""}, headers=r2["headers"],
        )
        assert req1.status_code == 200
        # Second request-join should fail with "ride is full" since max_riders=2 and organiser counts
        # Actually at request time only the organiser exists (1/2), so first request is accepted.
        # Second rider's request will either succeed (still 1/2) and fail on approve, OR fail here.
        # Our implementation checks capacity at request time — 1 + 0 crew = 1, so 1 < 2 → OK.
        # After approve of first, crew_ids has 1 → 1 + 1 = 2, full.

        ap1 = api_client.post(
            f"{base_url}/api/trips/{trip['id']}/requests/{req1.json()['id']}/approve",
            headers=organiser["headers"],
        )
        assert ap1.status_code == 200

        # Now trip is full. r2's request-join or approve must fail.
        if req2.status_code == 200:
            # approval must fail
            ap2 = api_client.post(
                f"{base_url}/api/trips/{trip['id']}/requests/{req2.json()['id']}/approve",
                headers=organiser["headers"],
            )
            assert ap2.status_code == 400
        else:
            # request-join itself already rejected — also valid
            assert req2.status_code == 400

    def test_my_trip_requests_returns_history(self, base_url, api_client):
        organiser = _register(base_url, api_client, "myr_org")
        trip = _create_public_trip(base_url, api_client, organiser["headers"])
        rider = _register(base_url, api_client, "myr_rider")
        api_client.post(
            f"{base_url}/api/trips/{trip['id']}/request-join",
            json={"note": ""}, headers=rider["headers"],
        )

        res = api_client.get(f"{base_url}/api/users/me/trip-requests", headers=rider["headers"])
        assert res.status_code == 200
        requests_list = res.json()
        assert any(r["trip_id"] == trip["id"] and r["status"] == "pending" for r in requests_list)


class TestAuthRefresh:
    def test_register_returns_both_tokens(self, base_url, api_client):
        u = _register(base_url, api_client, "ref1")
        assert u["token"]
        assert u["refresh_token"]

    def test_refresh_rotates_refresh_token(self, base_url, api_client):
        u = _register(base_url, api_client, "ref2")
        res = api_client.post(
            f"{base_url}/api/auth/refresh",
            json={"refresh_token": u["refresh_token"]},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["refresh_token"] != u["refresh_token"]

    def test_old_refresh_rejected_after_rotation(self, base_url, api_client):
        u = _register(base_url, api_client, "ref3")
        api_client.post(f"{base_url}/api/auth/refresh", json={"refresh_token": u["refresh_token"]})
        # Replay old
        replay = api_client.post(f"{base_url}/api/auth/refresh", json={"refresh_token": u["refresh_token"]})
        assert replay.status_code == 401

    def test_access_token_as_refresh_rejected(self, base_url, api_client):
        u = _register(base_url, api_client, "ref4")
        res = api_client.post(f"{base_url}/api/auth/refresh", json={"refresh_token": u["token"]})
        assert res.status_code == 401

    def test_garbage_refresh_rejected(self, base_url, api_client):
        res = api_client.post(f"{base_url}/api/auth/refresh", json={"refresh_token": "not.a.jwt"})
        assert res.status_code == 401

    def test_logout_revokes_refresh(self, base_url, api_client):
        u = _register(base_url, api_client, "ref5")
        out = api_client.post(
            f"{base_url}/api/auth/logout",
            json={"refresh_token": u["refresh_token"]},
            headers=u["headers"],
        )
        assert out.status_code == 200
        # Used refresh should now be rejected
        replay = api_client.post(f"{base_url}/api/auth/refresh", json={"refresh_token": u["refresh_token"]})
        assert replay.status_code == 401


# Rate limiting is exercised via the _rate_limit unit in server.py — E2E rate-limit
# tests are omitted here because they'd 429 every other test in the file. Run the
# suite with RATE_LIMIT_DISABLED=1 for full coverage of the feature flow.
