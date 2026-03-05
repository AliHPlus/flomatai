"""
ETL Analysis — Python skill using the flomatai bridge protocol.

Implements the flomatai_bridge protocol:
  Input:  JSON line from stdin: { "id": "uuid", "function": "analyze", "input": {...} }
  Output: JSON line to stdout: { "id": "uuid", "output": {...} }
          or on error:         { "id": "uuid", "error": "message" }
"""

import json
import sys
from collections import defaultdict


def analyze(data: dict) -> dict:
    """Analyze merged ETL data and return statistics."""
    sales = data.get("sales", [])
    users = data.get("users", [])
    metrics = data.get("metrics", {})

    # ── Sales Analysis ──────────────────────────────────────────────────────────
    revenue_by_product: dict = defaultdict(float)
    revenue_by_region: dict = defaultdict(float)
    revenue_by_month: dict = defaultdict(float)

    total_revenue = 0.0
    total_units = 0

    for row in sales:
        product = row.get("product", "Unknown")
        region = row.get("region", "Unknown")
        revenue = float(row.get("revenue", 0))
        quantity = int(row.get("quantity", 0))
        date = str(row.get("date", ""))
        month = date[:7] if date else "Unknown"

        revenue_by_product[product] += revenue
        revenue_by_region[region] += revenue
        revenue_by_month[month] += revenue
        total_revenue += revenue
        total_units += quantity

    top_product = max(revenue_by_product.items(), key=lambda x: x[1]) if revenue_by_product else ("", 0)
    top_region = max(revenue_by_region.items(), key=lambda x: x[1]) if revenue_by_region else ("", 0)

    months = sorted(revenue_by_month.keys())
    mom_growth = None
    if len(months) >= 2:
        prev = revenue_by_month[months[-2]]
        curr = revenue_by_month[months[-1]]
        mom_growth = round((curr - prev) / prev * 100, 2) if prev > 0 else None

    # ── User Analysis ───────────────────────────────────────────────────────────
    total_users = len(users)
    active_users = sum(1 for u in users if u.get("active", False))
    plan_distribution: dict = defaultdict(int)
    total_spend = 0.0
    high_value_users = []

    for u in users:
        plan = u.get("plan", "unknown")
        plan_distribution[plan] += 1
        spend = float(u.get("spend_lifetime", 0))
        total_spend += spend
        if spend > 5000:
            high_value_users.append({
                "name": u.get("name", ""),
                "plan": plan,
                "spend": spend,
                "sessions": u.get("sessions_last_30d", 0),
            })

    avg_spend = total_spend / total_users if total_users > 0 else 0
    churn_rate = (total_users - active_users) / total_users * 100 if total_users > 0 else 0

    # ── System Metrics ──────────────────────────────────────────────────────────
    growth = metrics.get("growth", {})
    performance = metrics.get("performance", {})
    api = metrics.get("api_calls", {})

    mrr_values = [
        growth.get("mrr_jan", 0),
        growth.get("mrr_feb", 0),
        growth.get("mrr_mar", 0),
    ]
    mrr_growth = None
    if mrr_values[0] > 0:
        mrr_growth = round((mrr_values[-1] - mrr_values[0]) / mrr_values[0] * 100, 2)

    return {
        "sales": {
            "total_revenue": round(total_revenue, 2),
            "total_units": total_units,
            "revenue_by_product": dict(sorted(revenue_by_product.items(), key=lambda x: -x[1])),
            "revenue_by_region": dict(sorted(revenue_by_region.items(), key=lambda x: -x[1])),
            "revenue_by_month": dict(revenue_by_month),
            "top_product": {"name": top_product[0], "revenue": round(float(top_product[1]), 2)},
            "top_region": {"name": top_region[0], "revenue": round(float(top_region[1]), 2)},
            "mom_growth_percent": mom_growth,
            "avg_revenue_per_transaction": round(total_revenue / len(sales), 2) if sales else 0,
        },
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": total_users - active_users,
            "churn_rate_percent": round(churn_rate, 2),
            "plan_distribution": dict(plan_distribution),
            "avg_lifetime_spend": round(avg_spend, 2),
            "high_value_users": sorted(high_value_users, key=lambda x: -x["spend"]),
        },
        "system": {
            "api_total_calls": api.get("total", 0),
            "api_error_rate": api.get("error_rate", 0),
            "api_avg_latency_ms": api.get("avg_latency_ms", 0),
            "uptime_percent": performance.get("uptime_percent", 0),
            "p99_latency_ms": performance.get("p99_latency_ms", 0),
            "incidents": performance.get("incidents", 0),
            "mrr_jan_to_mar_growth_percent": mrr_growth,
            "new_users_trend": [
                growth.get("new_users_jan", 0),
                growth.get("new_users_feb", 0),
                growth.get("new_users_mar", 0),
            ],
            "churn_rate_percent": growth.get("churn_rate_percent", 0),
        },
        "summary": {
            "period": metrics.get("period", "Q1 2024"),
            "headline_revenue": round(total_revenue, 2),
            "headline_users": total_users,
            "headline_mrr": mrr_values[-1],
        },
    }


FUNCTIONS = {"analyze": analyze}


def main():
    """Main bridge loop: read JSON lines from stdin, write JSON lines to stdout."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        call_id = ""
        try:
            msg = json.loads(line)
            call_id = msg.get("id", "")
            fn_name = msg.get("function", "")
            fn_input = msg.get("input", {})

            fn = FUNCTIONS.get(fn_name)
            if fn is None:
                result = {"id": call_id, "error": f"Unknown function: {fn_name}"}
            else:
                output = fn(fn_input)
                result = {"id": call_id, "output": output}
        except Exception as e:
            result = {"id": call_id, "error": str(e)}

        print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
