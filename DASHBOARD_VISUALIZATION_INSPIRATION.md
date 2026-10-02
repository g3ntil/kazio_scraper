# Kazio Scraper Dashboard: Telemetry & Visualization Inspiration Catalog

> **Observability & Design Architecture for the Kazio Scraper Pipeline**
> Curated from industry-leading telemetry dashboards (Grafana, Datadog, Tremor Raw, PostHog, Vercel, Monte Carlo Data Observability) tailored to Kazio's Warm Paper design system and Rwandan job aggregation pipelines.

---

## 1. Global Benchmark Inspiration & Design Patterns

| Platform | Primary Inspiration | Applied to Kazio Scraper |
|---|---|---|
| **Tremor Raw** | Clean KPI metric cards, sparkline micro-charts, and zero-clutter analytic widgets | KPI summary cards with inline micro-sparklines and delta tags (`+14% vs 7d avg`). |
| **Grafana / Prometheus** | Real-time Golden Signals (Latency, Traffic, Errors, Saturation) | 5-Source Health Matrix, HTTP response code breakdown (200, 429, 503), proxy latency gauges. |
| **Vercel / Railway** | Live streaming deployment logs with clean ANSI color coding and status dots | `activity.log` terminal streaming pg_cron crawler runs and Gemini enrichment events. |
| **Monte Carlo Data Observability** | Data pipeline health, schema drift monitoring, null surge alerts, and freshness SLA | Data Quality Studio monitoring salary field presence, deadline coverage %, and gate drop-off funnels. |
| **PostHog / Datadog** | Funnel & Sankey stage transitions | Multi-stage pipeline flow tracking listings: `Crawled -> Normalized -> Gated -> Enriched -> Published`. |
| **Linear / GitHub** | Micro-interactions, keyboard navigation, smooth 120ms transitions, 8px uniform radius | Minimalist ghost borders, 2px hover lift, instant drawer inspections. |

---

## 2. Rwandan Job Scraping Telemetry Architecture

The scraper pipeline ingests jobs from five distinct Rwandan job sources:
1. **BrighterMonday Rwanda** (`brightermonday.co.rw` via Playwright headless browser -> `raw_brightermonday_jobs`)
2. **Ndangira Rwanda** (`ndangira.com` via Cheerio static scraper -> `raw_ndangira_jobs`)
3. **JobWebRwanda** (`jobwebrwanda.com` -> `public.jobs`)
4. **GreatRwandaJobs** (`greatrwandajobs.com` -> `jobs_greatrwandajobs`)
5. **JobInRwanda** (`jobinrwanda.com` -> staging/central)

### Key Metrics Tracked
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. INGESTION VELOCITY: New listings added today per source                  │
│ 2. GATE RETENTION: % listings retained after excluding tenders, dups, exp  │
│ 3. AI EXTRACTION YIELD: % listings successfully parsed into 12 career fields│
│ 4. KEY HEADROOM: Combined RPM/RPD capacity across active Gemini API keys   │
│ 5. SLA FRESHNESS LAG: Hours elapsed since last successful source harvest    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. UI Component Blueprint & Design Tokens

### Kazio Design System Constraints
*   **Background**: Warm Paper (`#fbf9f5`), Container: `#ffffff`, Container Sub: `#f3efe6`
*   **Primary Accent**: Deep Ink (`#442a22`)
*   **Secondary**: Warm Clay (`#725a39`)
*   **Growth / Success**: Sage (`#293417`), Emerald (`#16813d`)
*   **Warning / Quota**: Warm Amber (`#a5690c`)
*   **Error / Critical**: Ruby Red (`#ba1a1a`)
*   **Radius**: Strict `8px` (`rounded-lg`) everywhere

---

## 4. Visual Component Toolkit (Installed in `src/components/visualization/`)

The following zero-dependency, React 19 + SVG + Tailwind v4 components are available for direct import:

### 1. `Sparkline`
- **Location**: `src/components/visualization/Sparkline.tsx`
- **Usage**: Inline 7-day or 24-hour volume trendlines inside KPI cards and table rows.
- **Features**: Auto-scaling SVG path, gradient drop shadow, min/max glow points, optional hover scrubber.

### 2. `PipelineStageFlow`
- **Location**: `src/components/visualization/PipelineStageFlow.tsx`
- **Usage**: Visualizes data conversion across the 5 ETL stages.
- **Features**: Step nodes with live count badges, drop-off markers (e.g., `-240 tenders`), and connection arrows with animated progress pulses.

### 3. `GaugeMeter`
- **Location**: `src/components/visualization/GaugeMeter.tsx`
- **Usage**: Radial quota and health speedometer.
- **Features**: Dual-color arc, centered value readout, threshold status badge (Nominal, Warning, Depleted).

### 4. `TelemetryAreaChart`
- **Location**: `src/components/visualization/TelemetryAreaChart.tsx`
- **Usage**: Multi-stream time-series graph for volume over time.
- **Features**: Smooth bezier curves, stacked or overlapping series, date labels, and interactive tooltip scrubbing.

### 5. `DataFreshnessMeter`
- **Location**: `src/components/visualization/DataFreshnessMeter.tsx`
- **Usage**: Visualizes SLA compliance per scraping source.
- **Features**: Progress bar showing elapsed time against SLA window (e.g., 6h / 12h / 24h), freshness status badge (`Fresh`, `Due Soon`, `Stale`).

### 6. `StatusPulseBadge`
- **Location**: `src/components/visualization/StatusPulseBadge.tsx`
- **Usage**: Live service health indicator.
- **Features**: Concentric pulsing radar ring for active scraping runs, steady indicator for nominal states.

### 7. `MetricKpiCard`
- **Location**: `src/components/visualization/MetricKpiCard.tsx`
- **Usage**: Top-of-dashboard summary card.
- **Features**: Title, large monospace value, subtitle, icon container, optional delta badge, and embedded sparkline.

---

## 5. Screen-by-Screen Implementation Guide

### A. Overview Page (`src/pages/OverviewPage.tsx`)
- **Top**: 6 `MetricKpiCard`s (New Today, Awaiting AI, AI Key Headroom, Gate Drops, Healthy Sources, Critical Alerts).
- **Hero**: `PipelineStageFlow` showing live stream from 5 Rwandan staging tables through Gemini AI structuring into `public.jobs`.
- **Center**: 5-Source Summary Cards with embedded `DataFreshnessMeter`s.
- **Lower**: Split view: `TelemetryAreaChart` (7-Day Ingestion Trends) side-by-side with Dark Terminal `activity.log`.

### B. Stats & Analytics Page (`src/pages/StatsPage.tsx`)
- **Top**: Comprehensive ingestion volume vs extraction error rate.
- **Middle**: Failure Waterfall: Bar breakdown of HTTP 429 rate limit vs AI 503 overload vs Short text skips.
- **Bottom**: Industry and Job Function distribution matrices with interactive hover filters.

### C. Queue & Automation Pages (`src/pages/QueuePage.tsx`, `src/pages/AutomationPage.tsx`)
- **Queue**: Awaiting AI queue depth gauge, estimated clearance time countdown, priority batch processor.
- **Automation**: pg_cron schedule visualizer, next trigger countdown timers, and webhook trigger status.

### D. Data Quality Studio (`src/pages/DataQualityPage.tsx`)
- **Completeness Radar**: % of jobs with complete Company, Title, Deadline, Salary Range, and AI Summary.
- **Quarantine Manager**: Filtered view of listings missing critical metadata with one-click re-extraction triggers.
