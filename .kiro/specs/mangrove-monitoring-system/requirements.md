# Requirements Document

## Introduction

The Mangrove Monitoring System is an expansion of the existing BAKAWATCH platform (Laravel 11 API + Next.js 15 frontend, PostgreSQL/PostGIS, Cloudinary, Leaflet, Chart.js). It introduces structured mangrove plantation recording, survival monitoring, ecosystem data collection, community participation management, GIS-based site mapping, restoration analytics, and formal reporting — all governed by role-based access for Field Workers/Volunteers, MENRO/Environmental Officers, and Admins.

---

## Glossary

- **System**: The BAKAWATCH Mangrove Monitoring System (the full platform including API and frontend)
- **Field_Worker**: An authenticated user with the `field_worker` role who records planting and monitoring data in the field
- **Volunteer**: An authenticated user with the `volunteer` role who participates in planting events and submits basic monitoring data
- **MENRO_Officer**: An authenticated user with the `menro` role (Municipal Environment and Natural Resources Officer) who reviews reports and monitors restoration progress
- **Admin**: An authenticated user with the `admin` role who manages users, project sites, and system activity
- **Plantation_Record**: A data record capturing a single mangrove planting event including species, date, location, and photo
- **Monitoring_Record**: A data record capturing a survival check on a previously planted mangrove, including height, diameter, survival status, growth stage, and disease observation
- **Restoration_Site**: A defined geographic area (polygon boundary) designated for mangrove restoration, managed by an Admin or MENRO_Officer
- **Ecosystem_Record**: A data record capturing environmental measurements at a site including soil salinity, water pH, temperature, and tidal condition
- **Planting_Event**: A scheduled community planting activity at a Restoration_Site with a defined date, time, and volunteer capacity
- **Survival_Status**: An enumerated value of either `alive` or `dead` indicating whether a monitored mangrove is living
- **Growth_Stage**: An enumerated value of `seedling`, `sapling`, `juvenile`, or `mature` indicating the developmental stage of a monitored mangrove
- **GeoTag**: A GPS-derived latitude/longitude coordinate pair attached to a record at the time of submission
- **Report_Generator**: The subsystem responsible for compiling and exporting restoration reports
- **Analytics_Engine**: The subsystem responsible for computing survival rates, species distribution, and growth trends from stored records
- **Cloudinary**: The external image storage service used for all photo uploads
- **PostGIS**: The PostgreSQL spatial extension used for geographic queries and boundary storage
- **DENR**: Department of Environment and Natural Resources — the national regulatory body for environmental compliance in the Philippines

---

## Requirements

### Requirement 1: Role-Based Access Control

**User Story:** As an Admin, I want role-based access enforced across all new modules, so that each user type can only perform actions appropriate to their role.

#### Acceptance Criteria

1. THE System SHALL support the roles `field_worker`, `volunteer`, `menro`, and `admin` in addition to the existing `staff` and `user` roles.
2. WHEN an authenticated user attempts to access an endpoint restricted to a different role, THE System SHALL return an HTTP 403 response.
3. THE System SHALL enforce that only `field_worker` and `volunteer` roles may submit Plantation_Records and Monitoring_Records.
4. THE System SHALL enforce that only `menro` and `admin` roles may review submitted records and generate official reports.
5. THE System SHALL enforce that only `admin` may create, update, or deactivate Restoration_Sites and manage user accounts.
6. WHEN a user's role is changed by an Admin, THE System SHALL invalidate all existing API tokens for that user.

---

### Requirement 2: Restoration Site Management

**User Story:** As an Admin, I want to create and manage restoration sites with defined geographic boundaries, so that all planting and monitoring data is spatially organized.

#### Acceptance Criteria

1. THE System SHALL allow an Admin to create a Restoration_Site with a name, description, geographic boundary (polygon), area in hectares, and status (`planned`, `active`, `completed`, `suspended`).
2. WHEN a Restoration_Site boundary is submitted, THE System SHALL store the boundary as a PostGIS `geometry(Polygon, 4326)` column.
3. THE System SHALL allow an Admin to update any field of an existing Restoration_Site.
4. WHEN a Restoration_Site status is set to `suspended`, THE System SHALL prevent new Plantation_Records from being submitted to that site.
5. THE System SHALL expose a public API endpoint that returns all active Restoration_Sites with their boundaries for map rendering.
6. IF a submitted Restoration_Site polygon is geometrically invalid, THEN THE System SHALL return a descriptive validation error without saving the record.

---

### Requirement 3: GPS-Based Geo-Tagging

**User Story:** As a Field Worker, I want my submitted records to be automatically geo-tagged with my GPS coordinates, so that planting locations are accurately captured on the map.

#### Acceptance Criteria

1. WHEN a Plantation_Record or Monitoring_Record is submitted, THE System SHALL require a `latitude` and `longitude` value in the request payload.
2. THE System SHALL store the GeoTag as a PostGIS `geometry(Point, 4326)` column on each Plantation_Record and Monitoring_Record.
3. WHEN a GeoTag is submitted with a latitude outside the range −90 to 90 or a longitude outside the range −180 to 180, THE System SHALL return a validation error.
4. THE Frontend SHALL provide a GPS capture interface that reads the device's current coordinates via the browser Geolocation API and pre-fills the latitude and longitude fields.
5. THE Frontend SHALL display a Leaflet map pin at the captured coordinates before the user submits the record, allowing the user to confirm or manually adjust the pin position.
6. WHERE a device does not support the Geolocation API, THE Frontend SHALL allow the user to manually enter latitude and longitude values.

---

### Requirement 4: Mangrove Plantation Recording

**User Story:** As a Field Worker or Volunteer, I want to record each planted mangrove with its species, date, site, photo, and seedling source, so that a complete planting history is maintained.

#### Acceptance Criteria

1. THE System SHALL allow an authenticated `field_worker` or `volunteer` to submit a Plantation_Record containing: species name, date planted, Restoration_Site ID, seedling source, GeoTag, and an optional photo.
2. WHEN a Plantation_Record is submitted with a photo, THE System SHALL upload the photo to Cloudinary and store the resulting URL and public ID on the record.
3. WHEN a Plantation_Record is submitted without a photo, THE System SHALL save the record with a null image URL.
4. IF the specified Restoration_Site ID does not exist or has a status of `suspended`, THEN THE System SHALL return a validation error and reject the record.
5. THE System SHALL store a timestamp of when the Plantation_Record was created, separate from the `date_planted` field.
6. THE System SHALL allow a `field_worker` or `volunteer` to retrieve all their own Plantation_Records.
7. THE System SHALL allow a `menro` or `admin` to retrieve all Plantation_Records for any Restoration_Site.

---

### Requirement 5: Survival Monitoring

**User Story:** As a Field Worker, I want to submit survival monitoring data for previously planted mangroves, so that restoration progress can be tracked over time.

#### Acceptance Criteria

1. THE System SHALL allow an authenticated `field_worker` to submit a Monitoring_Record linked to an existing Plantation_Record, containing: height in centimeters, diameter in centimeters, Survival_Status, Growth_Stage, disease observation text, GeoTag, and monitoring date.
2. WHEN a Monitoring_Record is submitted with a Survival_Status of `dead`, THE System SHALL record the date of the monitoring as the confirmed mortality date on the linked Plantation_Record.
3. THE System SHALL allow multiple Monitoring_Records to be submitted for the same Plantation_Record over time, preserving the full history.
4. IF a Monitoring_Record references a Plantation_Record ID that does not exist, THEN THE System SHALL return a validation error.
5. WHEN a height or diameter value less than zero is submitted, THE System SHALL return a validation error.
6. THE System SHALL allow a `menro` or `admin` to retrieve all Monitoring_Records for a given Restoration_Site, ordered by monitoring date descending.

---

### Requirement 6: Photo Documentation

**User Story:** As a Field Worker, I want to upload timestamped before-and-after photos of restoration sites, so that visual evidence of progress is documented.

#### Acceptance Criteria

1. THE System SHALL allow an authenticated `field_worker` or `menro` to upload a site photo associated with a Restoration_Site, with a `photo_type` of either `before` or `after`.
2. WHEN a site photo is uploaded, THE System SHALL store the Cloudinary URL, public ID, upload timestamp, uploader user ID, Restoration_Site ID, and `photo_type`.
3. THE System SHALL allow retrieval of all site photos for a given Restoration_Site, filterable by `photo_type`.
4. WHEN a photo file exceeding 10 MB is submitted, THE System SHALL return a validation error before attempting the Cloudinary upload.
5. THE System SHALL accept photo uploads in JPEG, PNG, and WEBP formats only; IF another format is submitted, THEN THE System SHALL return a validation error.

---

### Requirement 7: Ecosystem Monitoring

**User Story:** As a Field Worker, I want to record environmental measurements at a restoration site, so that ecosystem health can be correlated with mangrove survival data.

#### Acceptance Criteria

1. THE System SHALL allow an authenticated `field_worker` to submit an Ecosystem_Record for a Restoration_Site containing: soil salinity in parts per thousand (ppt), water pH, water temperature in degrees Celsius, tidal condition (`low`, `mid`, `high`, `storm`), GeoTag, and measurement date.
2. WHEN an Ecosystem_Record is submitted with a pH value outside the range 0 to 14, THE System SHALL return a validation error.
3. WHEN an Ecosystem_Record is submitted with a soil salinity value less than 0, THE System SHALL return a validation error.
4. THE System SHALL allow a `menro` or `admin` to retrieve all Ecosystem_Records for a given Restoration_Site, ordered by measurement date descending.
5. THE Analytics_Engine SHALL compute the average soil salinity, average pH, and average temperature per Restoration_Site per calendar month from stored Ecosystem_Records.

---

### Requirement 8: Community Participation and Planting Events

**User Story:** As a MENRO Officer, I want to create and manage planting events with volunteer registration, so that community participation is organized and tracked.

#### Acceptance Criteria

1. THE System SHALL allow a `menro` or `admin` to create a Planting_Event for a Restoration_Site with: event name, description, scheduled date and time, location name, maximum volunteer capacity, and status (`open`, `closed`, `completed`, `cancelled`).
2. WHEN an authenticated `volunteer` or `field_worker` registers for a Planting_Event, THE System SHALL record the registration with the user ID, event ID, and registration timestamp.
3. WHEN a Planting_Event has reached its maximum volunteer capacity, THE System SHALL reject new registrations and return an informative error message.
4. THE System SHALL allow a `menro` or `admin` to close or cancel a Planting_Event, which prevents further registrations.
5. THE System SHALL expose a public API endpoint listing all `open` Planting_Events with their Restoration_Site name, date, and remaining capacity.
6. WHEN a Planting_Event is cancelled, THE System SHALL send a notification to all registered participants.

---

### Requirement 9: Interactive GIS Map Dashboard

**User Story:** As a MENRO Officer or public user, I want to view an interactive map showing all restoration sites with color-coded status indicators, so that I can quickly assess the state of restoration efforts.

#### Acceptance Criteria

1. THE Frontend SHALL render all Restoration_Sites as polygon overlays on a Leaflet map, color-coded by status: `planned` = blue, `active` = green, `completed` = teal, `suspended` = red.
2. WHEN a user clicks a Restoration_Site polygon on the map, THE Frontend SHALL display a popup showing the site name, status, total planted count, and survival rate percentage.
3. THE Frontend SHALL provide filter controls allowing the user to filter visible sites by year of establishment and by barangay or location name.
4. THE Frontend SHALL display individual Plantation_Record pins on the map when a Restoration_Site is selected, using distinct icons per species.
5. WHEN the map is loaded, THE Frontend SHALL fetch site and planting data from the API and render all markers within 3 seconds on a standard broadband connection.

---

### Requirement 10: Restoration Analytics

**User Story:** As a MENRO Officer, I want to view summary analytics for each restoration site, so that I can report on progress and identify underperforming areas.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL compute the total number of planted mangroves per Restoration_Site from all associated Plantation_Records.
2. THE Analytics_Engine SHALL compute the survival rate percentage per Restoration_Site as: (count of Plantation_Records with at least one Monitoring_Record where Survival_Status = `alive`) / (total Plantation_Records) × 100, rounded to two decimal places.
3. THE Analytics_Engine SHALL compute the species distribution as a count and percentage breakdown of all Plantation_Records grouped by species name per Restoration_Site.
4. THE Analytics_Engine SHALL compute a monthly growth trend by averaging the height measurements from Monitoring_Records grouped by calendar month per Restoration_Site.
5. THE Frontend SHALL render the survival rate as a percentage value and as a Chart.js doughnut chart per Restoration_Site.
6. THE Frontend SHALL render the monthly growth trend as a Chart.js line chart per Restoration_Site.
7. THE Frontend SHALL render the species distribution as a Chart.js bar chart per Restoration_Site.

---

### Requirement 11: Reporting and Documentation

**User Story:** As a MENRO Officer, I want to generate and export standardized restoration reports, so that I can submit compliance documentation to the LGU and DENR.

#### Acceptance Criteria

1. THE Report_Generator SHALL produce a monthly restoration report for a specified Restoration_Site and calendar month, containing: total planted, total alive, total dead, survival rate, species breakdown, and average ecosystem measurements.
2. THE Report_Generator SHALL produce an LGU monitoring report covering all Restoration_Sites within a specified date range, aggregating the same metrics as the monthly report.
3. THE Report_Generator SHALL produce a DENR-ready documentation report formatted according to the standard DENR mangrove monitoring template fields.
4. THE System SHALL allow a `menro` or `admin` to export any generated report as an Excel (.xlsx) file containing all tabular data.
5. WHEN a report is generated for a date range with no data, THE Report_Generator SHALL return an empty report structure with zero values rather than an error.
6. THE System SHALL store a record of each generated report including the generator's user ID, report type, date range, and generation timestamp.

---

### Requirement 12: Timestamp Verification and Geo-Verification

**User Story:** As an Admin, I want submitted records to be verified for temporal and spatial plausibility, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN a Plantation_Record or Monitoring_Record is submitted with a `date_planted` or `monitoring_date` more than 7 days in the future, THE System SHALL return a validation error.
2. WHEN a Plantation_Record is submitted with a GeoTag that falls outside the boundary of the specified Restoration_Site by more than 500 meters, THE System SHALL flag the record with a `geo_mismatch` warning and store it with a `flagged` status for MENRO review.
3. THE System SHALL record the server-side `created_at` timestamp on all Plantation_Records, Monitoring_Records, and Ecosystem_Records, independent of any client-supplied date fields.
4. THE System SHALL log all create, update, and delete operations on Plantation_Records, Monitoring_Records, Ecosystem_Records, and Restoration_Sites to the existing activity_logs table.

---

### Requirement 13: Data Backup

**User Story:** As an Admin, I want the system to support database backup operations, so that restoration data is protected against loss.

#### Acceptance Criteria

1. THE System SHALL provide an Admin-only API endpoint that triggers a PostgreSQL database dump and stores the resulting file in a designated backup storage location.
2. WHEN a backup operation completes successfully, THE System SHALL log the completion timestamp, file size, and storage path to the activity_logs table.
3. IF a backup operation fails, THEN THE System SHALL log the failure reason and return an error response to the Admin.
