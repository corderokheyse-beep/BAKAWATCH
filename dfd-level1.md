# BAKAWATCH — Data Flow Diagram Level 1

```mermaid
flowchart LR

    %% ══════════════════════════════════════════════
    %% EXTERNAL ENTITIES (left side)
    %% ══════════════════════════════════════════════
    E1[👤 Admin / Staff]
    E2[👤 MENRO Officer]
    E3[👤 Field Worker]
    E4[👤 Volunteer]
    E5[👤 Community Member]
    E6[☁️ Cloudinary\nImage Service]

    %% ══════════════════════════════════════════════
    %% PROCESSES (center)
    %% ══════════════════════════════════════════════
    P1(["P1\n─────────────\nAuthentication &\nUser Management"])
    P2(["P2\n─────────────\nRestoration Site\nManagement"])
    P3(["P3\n─────────────\nField Data\nCollection"])
    P4(["P4\n─────────────\nEvent & Volunteer\nManagement"])
    P5(["P5\n─────────────\nCommunity\nReporting"])
    P6(["P6\n─────────────\nAnalytics &\nReport Generation"])
    P7(["P7\n─────────────\nNotification\nDispatch"])

    %% ══════════════════════════════════════════════
    %% DATA STORES (right side)
    %% ══════════════════════════════════════════════
    D1[("D1\nusers")]
    D2[("D2\nreports")]
    D3[("D3\nrestoration_sites")]
    D4[("D4\nplantation_records")]
    D5[("D5\nrestoration_projects")]
    D6[("D6\nmonitoring_records")]
    D7[("D7\necosystem_records")]
    D8[("D8\nplanting_events")]
    D9[("D9\nevent_registrations")]
    D10[("D10\nnotifications")]
    D11[("D11\nactivity_logs")]
    D12[("D12\ngenerated_reports")]

    %% ══════════════════════════════════════════════
    %% P1 — AUTHENTICATION & USER MANAGEMENT
    %% ══════════════════════════════════════════════
    E1 -- "Login credentials" --> P1
    E2 -- "Login credentials" --> P1
    E3 -- "Login credentials" --> P1
    E4 -- "Login credentials" --> P1
    E5 -- "Register / Login" --> P1

    P1 -- "Auth token + role" --> E1
    P1 -- "Auth token + role" --> E2
    P1 -- "Auth token + role" --> E3
    P1 -- "Auth token + role" --> E4
    P1 -- "Auth token + role" --> E5

    P1 -- "Save / update user" --> D1
    D1 -- "User profile & role" --> P1

    %% ══════════════════════════════════════════════
    %% P2 — RESTORATION SITE MANAGEMENT
    %% ══════════════════════════════════════════════
    E2 -- "Create / update site\nor project" --> P2
    E1 -- "Manage sites\n& projects" --> P2

    P2 -- "Site record" --> D3
    D3 -- "Site details" --> P2
    P2 -- "Project record" --> D5
    D5 -- "Project details" --> P2
    P2 -- "Log action" --> D11

    %% ══════════════════════════════════════════════
    %% P3 — FIELD DATA COLLECTION
    %% ══════════════════════════════════════════════
    E3 -- "Plantation record\n+ GPS coordinates" --> P3
    E3 -- "Monitoring record\n(height, diameter,\nsurvival status)" --> P3
    E3 -- "Ecosystem measurement\n(salinity, pH, temp,\ntidal condition)" --> P3
    E4 -- "Plantation record\n+ GPS coordinates" --> P3

    D3 -- "Site boundary\nfor geo-verification" --> P3
    P3 -- "Geo-verification result\n(match / mismatch)" --> E3

    P3 -- "Plantation record" --> D4
    P3 -- "Monitoring record" --> D6
    P3 -- "Ecosystem record" --> D7

    P3 -- "Upload photo" --> E6
    E6 -- "Image URL" --> P3
    P3 -- "Log action" --> D11

    %% ══════════════════════════════════════════════
    %% P4 — EVENT & VOLUNTEER MANAGEMENT
    %% ══════════════════════════════════════════════
    E2 -- "Create / cancel event" --> P4
    E4 -- "Register for event" --> P4
    E5 -- "Register for event" --> P4

    P4 -- "Event record" --> D8
    D8 -- "Event details" --> P4
    P4 -- "Registration record" --> D9
    D9 -- "Registrant list" --> P4

    P4 -- "Trigger cancellation\nnotification" --> P7
    P4 -- "Log action" --> D11

    %% ══════════════════════════════════════════════
    %% P5 — COMMUNITY REPORTING
    %% ══════════════════════════════════════════════
    E5 -- "Geo-tagged report\n+ photo" --> P5
    E1 -- "Review decision\n+ admin notes" --> P5

    P5 -- "Report record" --> D2
    D2 -- "Report data" --> P5

    P5 -- "Upload photo" --> E6
    E6 -- "Image URL" --> P5

    P5 -- "Trigger status\nnotification" --> P7
    P5 -- "Log action" --> D11

    %% ══════════════════════════════════════════════
    %% P6 — ANALYTICS & REPORT GENERATION
    %% ══════════════════════════════════════════════
    E1 -- "Request analytics\nor report" --> P6
    E2 -- "Request analytics\nor report" --> P6

    D4 -- "Plantation data" --> P6
    D6 -- "Monitoring data" --> P6
    D7 -- "Ecosystem data" --> P6
    D3 -- "Site data" --> P6
    D2 -- "Community reports" --> P6
    D11 -- "Audit logs" --> P6

    P6 -- "Generated report file" --> D12
    D12 -- "Stored report" --> P6
    P6 -- "Dashboard stats\n& downloadable report" --> E1
    P6 -- "Dashboard stats\n& downloadable report" --> E2

    %% ══════════════════════════════════════════════
    %% P7 — NOTIFICATION DISPATCH
    %% ══════════════════════════════════════════════
    P7 -- "Save notification" --> D10
    D10 -- "Unread notifications" --> P7

    P7 -- "In-app notification" --> E1
    P7 -- "In-app notification" --> E2
    P7 -- "In-app notification" --> E3
    P7 -- "In-app + email\nnotification" --> E4
    P7 -- "In-app + email\nnotification" --> E5

    %% ══════════════════════════════════════════════
    %% STYLING
    %% ══════════════════════════════════════════════
    classDef entity    fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e3a5f,font-weight:bold
    classDef process   fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d,font-weight:bold
    classDef datastore fill:#fef9c3,stroke:#ca8a04,stroke-width:2px,color:#713f12
    classDef external  fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#3b0764

    class E1,E2,E3,E4,E5 entity
    class E6 external
    class P1,P2,P3,P4,P5,P6,P7 process
    class D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11,D12 datastore
```

---

## Legend

| Symbol | Color | Meaning |
|--------|-------|---------|
| Rectangle (blue) | 🔵 Blue | External Entity — people or systems outside BAKAWATCH |
| Rounded rectangle (green) | 🟢 Green | Process — a function the system performs |
| Cylinder (yellow) | 🟡 Yellow | Data Store — where data is saved in the database |
| Rectangle (purple) | 🟣 Purple | External Service — third-party (Cloudinary) |

---

## Process Summary

| # | Process | Triggered By | Key Data Stores |
|---|---------|-------------|-----------------|
| P1 | Authentication & User Management | All users logging in | D1 users |
| P2 | Restoration Site Management | MENRO / Admin | D3 sites, D5 projects |
| P3 | Field Data Collection | Field Worker / Volunteer | D4 plantation, D6 monitoring, D7 ecosystem |
| P4 | Event & Volunteer Management | MENRO / Volunteer | D8 events, D9 registrations |
| P5 | Community Reporting | Community Member / Admin | D2 reports |
| P6 | Analytics & Report Generation | Admin / MENRO | D4, D6, D7, D3, D2, D11, D12 |
| P7 | Notification Dispatch | P4 (cancellation), P5 (report review) | D10 notifications |
