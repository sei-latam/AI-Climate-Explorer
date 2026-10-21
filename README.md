# AI Climate Risk Portfolio Explorer

<p align="center">
  <img src="https://github.com/sei-latam/AI-Climate-Explorer/blob/main/1.0%20Architecture/AI%20TF%20Climate%20Explorer.gif" alt="AI Climate Explorer banner" width="100%" />
</p>

AI Climate Risk Portfolio Explorer is a browser-based geospatial dashboard for screening physical climate risks across an asset portfolio. It combines climate hazard grids from the Climate Impact Explorer (CIE) with asset locations, spatial analysis, and portfolio summaries to help users compare scenarios, detect hotspots, and explore impact pathways.

The project was developed by SEI Latin America and is designed to support climate-risk screening for industrial and infrastructure portfolios in Colombia and similar geographies.

## Overview

This repository implements a prototype platform for:

- Visualizing climate hazard layers in 2D and 3D maps
- Comparing scenarios and time horizons (for example, 2030 vs 2050)
- Evaluating asset-level exposure using nearest-cell matching and portfolio metrics
- Ranking assets by relative risk within a portfolio
- Providing a mock AI agent workflow for climate query interpretation and report generation
- Exporting or sharing climate-risk summaries for decision support

The project is primarily front-end driven and uses public climate data sources and geospatial libraries in the browser.

## Repository structure

```text
AI-Climate-Explorer/
├── 0. Old version/                 # Legacy experiments, R scripts, and early demo outputs
├── 1.0 Architecture/              # System architecture assets and visual documentation
├── 2.0 docs/                      # Core front-end logic: geovisor, translations, UI behavior
├── 3.0 Data/                      # Climate data, metadata dictionaries, and source files
├── 4.0 Concept Note/              # Conceptual design notes and project rationale
├── LICENSE                        # Project license
├── README.md                      # Project documentation
└── .gitignore                    # Git ignore rules
```

## System architecture

The system is organized around a browser-based geospatial application with these key layers:

1. Frontend layer
   - JavaScript-driven UI with Leaflet (2D) and Cesium (3D)
   - Climate layer rendering, legends, asset markers, popups, filters, and user controls
   - Portfolio metrics panel and AI query panel

2. Data ingestion layer
   - Climate data comes from the Climate Impact Explorer v2 API
   - A GitHub backup path mirrors the same data for resilience when the live API is unavailable
   - Local CSV/GeoJSON uploads are supported for custom asset locations

3. Spatial processing layer
   - Grid cells are parsed from wide CSV or long-form CSV files
   - Asset coordinates are matched to the nearest grid cell or exact cell if available
   - Portfolio statistics are computed from these matched values

4. Analysis and presentation layer
   - Hazard layers are compared by scenario or difference over time
   - Terciles are computed within the current portfolio to classify assets as LOW/MEDIUM/HIGH risk
   - User-facing charts and fact sheets summarize exposure and change

5. AI layer (prototype / demo)
   - The system includes a multi-agent workflow that simulates query parsing, risk assessment, report generation, and delivery
   - This is not yet connected to a production LLM or backend service, but it does use real map data and portfolio context as the basis for simulated responses

## Data flow

The typical end-to-end flow is:

```text
User input / asset import
        ↓
Asset coordinates + portfolio metadata
        ↓
Grid data fetch (CIE API or GitHub backup)
        ↓
CSV parsing and spatial indexing
        ↓
Nearest-cell / exact-cell extraction
        ↓
Portfolio metrics + relative risk tiers
        ↓
Map rendering + charts + AI summarization
```

In practice, climate rasters are loaded as lat/lon/value points, indexed into a regular grid, and then queried by asset coordinates. This makes it possible to compute exposure quickly and to compare two scenarios at a portfolio scale.

## Technology stack

### Frontend and visualization
- HTML5
- CSS / Tailwind-like custom styling within the static UI
- JavaScript (ES6+)
- Leaflet for 2D mapping
- Cesium for 3D globe and terrain visualization
- ArcGIS and Bing/Esri map providers for basemaps
- Plot-style mini charts and HTML-based dashboard summaries

### Climate data and geospatial processing
- Climate Impact Explorer (CIE) v2 API
- Raw CSV climate data in the repository
- GeoJSON/CSV import capabilities for custom asset datasets
- Lat/lon grid indexing and nearest-neighbor lookup logic in JavaScript

### AI / simulation layer
- JavaScript prompt flow and simulated agent logic
- Natural-language query parsing for variables and scenarios
- RAG-style knowledge retrieval simulation using context metadata and indicator documentation
- Browser-side report generation and delivery workflow mockups

### Data sources and services
- Climate Analytics / Climate Impact Explorer v2
- GitHub raw content hosting for climate backup files
- OpenStreetMap Nominatim for geocoding and map lookup
- Esri / ArcGIS basemap services
- Cesium Ion access token for 3D imagery

## Data and climate model context

The repository includes metadata and variable definitions for climate indicators such as:

- HI-danger (dangerous heat days)
- TXx (annual maximum daily temperature)
- rx1day / rx5day (precipitation extremes)
- consecutive_dry_days
- tasAdjust and prAdjust
- wsi (water stress index)
- spei_gamma_12
- labour-productivity-loss
- dis (river discharge)
- fwixd (fire-weather days)

This data is aligned with the Climate Impact Explorer variable dictionary stored in `3.0 Data/diccionario_variables.csv`.

The application supports both:

- live API mode using scenario codes such as `rcp26`, `rcp45`, `rcp85`
- static backup mode using warming-level CSVs stored in the repository (`+1.5°C`, `+3.0°C`)

## Database and infrastructure

This repository does not currently implement a production PostgreSQL database or cloud deployment stack. The project behaves as a frontend prototype and data-exploration dashboard, with several important implications:

- Climate data is delivered as flat files and CSV payloads
- The system does not have a persistent application database in the codebase
- Asset state is kept in browser memory
- Deployment is intended to be lightweight and static or containerized, rather than fully cloud-native

The project mentions Google Cloud Platform in the broader product vision, but the GitHub repository itself does not implement a complete GCP deployment architecture. The infrastructure is more conceptually planned than production-ready.

## AI / ML pipeline

The platform includes a mock AI pipeline inspired by a retrieval-augmented generation (RAG) design:

1. Query parsing
   - Natural-language input is analyzed for climate variable, scenario, asset names, and time horizons.

2. Climate data selection
   - The relevant hazard variable and scenario are chosen dynamically from the map context.

3. Risk assessment
   - Asset values are validated, ranked, and summarized across scenarios.

4. Retrieval layer
   - The system simulates a knowledge-base context using indicator documentation and climate-risk guidance.

5. Response generation
   - A structured answer is produced with ranking logic, asset insights, and a PDF-style summary report.

6. Delivery and feedback
   - The app simulates email delivery, PDF generation, and post-response satisfaction flow.

This is a demonstration workflow, not a production-grade AI system. It is useful for product exploration and prototype validation, but it does not yet connect to a real LLM backend, vector database, or model serving infrastructure.

## Existing documentation and project assets

The repository contains supporting documentation and concept artifacts:

- `1.0 Architecture/` — architecture visuals and the animated system overview
- `4.0 Concept Note/` — conceptual note describing project logic and rationale
- `2.0 docs/` — app logic, translations, and UI workflows
- `3.0 Data/` — climate metadata and downloaded data files

The repository does not currently include a full security policy, contribution guide, or code of conduct at the root level, although the project structure suggests an active prototype and research environment.

## Code quality assessment

The codebase shows a working prototype with several strengths:

- Clear separation of roles between data parsing, map rendering, and asset analysis
- Good modularization in JavaScript functions
- Support for multiple map modes and UI toggles
- Real climate data integration with fallback logic
- Good user experience for interactive exploration and demo workflows

However, there are several areas for improvement:

- Large JavaScript file with many responsibilities in a single script (`geovisor.js`)
- Limited automated testing coverage
- No obvious backend or API layer for secure production operations
- Browser-side state management can become hard to maintain as features grow
- Some hard-coded values and tokens (for example, Cesium token strings and fixed paths) should be moved to a secure configuration layer
- The AI workflow is simulated and should not be assumed to reflect real model outputs without validation
- Error handling is partially implemented, but production-grade validation and logging are still missing

## Security considerations

The repository demonstrates a demo-level app and is not a hardened production application. Security concerns include:

- Hardcoded credentials or access tokens in front-end code
- Browser-executed data loading without robust validation in production deployments
- Use of open geographic basemap and geocoding APIs without governance constraints
- Absence of secure backend authentication and authorization patterns
- Need for strict input validation when users upload CSV or GeoJSON files

Recommended improvements:

- Move secrets and API tokens to environment variables or secure secret management
- Add server-side validation and sanitization for uploaded data
- Use HTTPS-only and secure asset hosting patterns
- Add security scanning and dependency review in CI/CD

## Deployment and repository configuration

The repository appears to be a static web prototype rather than a complete production deployment. The project includes standard GitHub repository structure and a README, but there is no strong evidence of a mature GitHub Actions pipeline or other deployment automation visible in the root tree.

Likely deployment model:

- Static front-end hosting via GitHub Pages, Netlify, Cloud Run, or a static web server
- Climate data served as raw files or proxied through API endpoints
- Browser-based interactivity with no dedicated backend service

## Opportunities for improvement

### Product/UX
- Improve onboarding and in-app help text
- Add a guided workflow for first-time users
- Improve accessibility and keyboard navigation

### Technical quality
- Split the large JavaScript files into smaller components and modules
- Add automated tests for parsing logic, scenario changes, and risk calculations
- Add linting, formatting, and CI checks

### Data quality and robustness
- Add explicit validation for all input datasets and climate indicators
- Document assumptions around nearest-neighbor matching and grid resolution
- Capture metadata about data versioning and source update dates

### Security and production readiness
- Remove embedded secrets from client code
- Adopt a secure backend service for API access and data governance
- Build explicit authentication and authorization flows if this becomes a multi-user platform

### Documentation
- Add a proper architecture diagram in Markdown or Mermaid format
- Add a user manual and deployment guide
- Document how climate indices are calculated and interpreted

## Getting started

Because the project is mostly a front-end browser application, the quickest way to explore it is to serve the repository locally with a static web server.

Example using Python:

```bash
cd AI-Climate-Explorer
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

If the entry page is stored in a nested folder or generated documentation layout, follow the repository’s main app file structure and open the appropriate page from the `2.0 docs` or related directories.

## License

This project is distributed under the LICENSE file included in the repository.

## Summary

AI Climate Risk Portfolio Explorer is a useful prototype for geospatial climate-risk screening, combining climate data, scenario comparisons, and portfolio-level analytics in a browser-based experience. It demonstrates an encouraging path from raw geospatial data to a decision-support application, but still needs stronger production architecture, documentation, security controls, and backend services before being considered a production-grade climate intelligence platform.

---

If you want, I can also produce:

- a shorter, more polished version for GitHub marketing
- a more technical README for engineers
- a Spanish version aligned with the original repository tone
- a README tailored to a public release or academic presentation
