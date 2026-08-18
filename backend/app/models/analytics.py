from pydantic import BaseModel


class DefenseMetric(BaseModel):
    number: int
    name: str
    count: int
    note: str | None = None


class ThroughputStats(BaseModel):
    intake_count: int
    delivered_count: int
    rto_count: int
    rto_rate_pct: float
    bags_awaiting_pickup: int
    avg_dwell_hours: float | None


class StaffLeaderboardEntry(BaseModel):
    id: str
    name: str | None
    phone: str
    role: str
    error_points: int


class ValueRiskStats(BaseModel):
    total_declared_value: float
    value_in_transit: float
    high_value_undelivered_count: int


class MsmeStatEntry(BaseModel):
    id: str
    business_name: str
    shipment_count: int


class MsmeStats(BaseModel):
    total_msmes: int
    top_by_volume: list[MsmeStatEntry]


class RoutingGap(BaseModel):
    pincode: str
    shipment_count: int


class AnalyticsOut(BaseModel):
    scope_type: str  # "NETWORK" | "HUB"
    scope_hub_name: str | None
    defenses: list[DefenseMetric]
    throughput: ThroughputStats
    staff_leaderboard: list[StaffLeaderboardEntry]
    value_risk: ValueRiskStats
    msme_stats: MsmeStats
    routing_gaps: list[RoutingGap]
