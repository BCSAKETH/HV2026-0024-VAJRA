from app.core.velocity import haversine_km

GROUP_PRECISION = 4  # ~11m at the equator — catches "same building" despite minor geocode jitter


def group_multidrop(shipments: list[dict]) -> list[dict]:
    """Defense 8, part 1 — collapse shipments sharing (near-)identical
    coordinates into one stop, so an apartment block with five orders shows
    up as one card, not five."""
    groups: dict[str, dict] = {}
    order: list[str] = []

    for s in shipments:
        lat, lng = s.get("delivery_lat"), s.get("delivery_lng")
        if lat is None or lng is None:
            key = f"no-gps:{s['tracking_id']}"
            group_lat, group_lng = None, None
        else:
            group_lat, group_lng = round(lat, GROUP_PRECISION), round(lng, GROUP_PRECISION)
            key = f"{group_lat},{group_lng}"

        if key not in groups:
            groups[key] = {"lat": group_lat, "lng": group_lng, "shipments": []}
            order.append(key)
        groups[key]["shipments"].append(s)

    return [groups[k] for k in order]


def nearest_neighbor_route(start: tuple[float, float], groups: list[dict]) -> list[dict]:
    """Defense 8, part 2 — greedy TSP Nearest-Neighbor over the grouped
    stops. Not optimal (true TSP is NP-hard), but a driver visiting stops in
    "always go to whichever is closest next" order beats an arbitrary or
    intake-order list, and it's O(n^2) which is plenty fast for a single
    driver's daily manifest."""
    routable = [g for g in groups if g["lat"] is not None]
    unroutable = [g for g in groups if g["lat"] is None]

    remaining = routable.copy()
    route: list[dict] = []
    current = start

    while remaining:
        nearest_i = min(range(len(remaining)), key=lambda i: haversine_km(current[0], current[1], remaining[i]["lat"], remaining[i]["lng"]))
        nxt = remaining.pop(nearest_i)
        route.append(nxt)
        current = (nxt["lat"], nxt["lng"])

    # Ungeocoded stops can't be distance-sorted — they go last, with a flag
    # for the UI to prompt "call the recipient to confirm location".
    return route + unroutable
