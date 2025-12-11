# **Zoho CRM Clone: Antigravity Agent-First Build System** 🤖

Complete prompt workflow to build your entire CRM using Antigravity's agentic capabilities. Give these prompts in sequence to orchestrate the entire pipeline.

---

## **PHASE 1: PROJECT SCOPING & ARCHITECTURE (Agent Decides)**

### **Prompt 1: Initial Architecture Scoping**

```
I want to build a Zoho CRM clone on Antigravity with the following requirements:

CORE FEATURES:
1. Lead management (CRUD, search, filters)
2. CSV import/export (full data pipeline)
3. Custom field builder (drag-drop, unlimited fields)
4. Lead enrichment (Hunter.io API, web scraping, data extraction)
5. Modern React UI (TanStack Table for performance)
6. Lead scoring (rule-based + ML-ready)

TECH STACK:
- Frontend: React 18 + TanStack Table v8 + Tailwind CSS
- Backend: Node.js/Express + Antigravity Database
- Database: Antigravity (PostgreSQL under the hood)
- Integrations: Hunter.io, web scrapers (Cheerio)

REQUIREMENTS:
- Fully functional, production-ready code
- No TODOs or placeholders
- Modular, extensible architecture
- Complete error handling & validation
- Docker-ready deployment

Please analyze this and create a comprehensive TASK ARTIFACT that breaks down:
1. Database schema design (leads, companies, deals, custom_fields, enrichment_logs)
2. Backend API structure (Express routes, services, integrations)
3. Frontend component architecture (LeadTable, CSVImport, Enrichment, etc.)
4. Integration points (Hunter.io, web scraping)
5. Deployment setup (Docker, environment config)

Then create an IMPLEMENTATION PLAN that outlines the exact files, code patterns, and dependencies needed.

After I review and approve the artifacts, proceed with implementation.
```

**Expected Output:**
- Task List artifact (detailed breakdown)
- Implementation Plan artifact (technical architecture)
- Environment setup checklist

---

## **PHASE 2: DATABASE & BACKEND (Full Implementation)**

### **Prompt 2: Antigravity Database Schema**

```
Create the complete Antigravity database schema for this CRM with proper:
- All 8 core tables (users, leads, companies, deals, custom_fields, enrichment_logs, activities, audit_logs)
- UUID primary keys
- JSONB fields for custom_fields and enrichment_data
- Proper indexes for common queries (email, status, created_at, company_id)
- Foreign keys with CASCADE delete where appropriate
- Timestamp fields (created_at, updated_at)

Generate:
1. Complete SQL migration script for Antigravity
2. Seeding script with 100 sample leads and 20 companies
3. Index strategy documentation
4. Connection configuration file (antigravity-config.js)

Make it production-ready with proper constraints and validation.
```

**Expected Output:**
- `schema.sql` - Complete database definition
- `seed.sql` - Sample data
- `antigravity-config.js` - Connection setup
- `database-strategy.md` - Documentation

---

### **Prompt 3: Backend API Structure**

```
Create the complete Node.js/Express backend for the CRM with this structure:

CORE SERVICES:
1. LeadService (CRUD, search, filtering, bulk operations)
2. EnrichmentService (Hunter.io integration, web scraping, scoring)
3. CSVService (import validation, export flattening)
4. CustomFieldService (field validation, metadata management)
5. CompanyService (company enrichment, tech stack detection)

ROUTES:
- /api/leads (GET, POST, PUT, DELETE)
- /api/leads/search (full-text search with filters)
- /api/import/csv (file upload, validation, batch insert)
- /api/export/csv (filtered export with custom fields)
- /api/enrichment/:id (single lead enrichment)
- /api/enrichment/bulk (async bulk enrichment)
- /api/custom-fields (CRUD for field definitions)
- /api/companies (company CRUD & enrichment)

INTEGRATIONS:
- Hunter.io (email finder, domain info)
- Web scraping (company info extraction)
- CSV parsing (papa-parse backend)

MIDDLEWARE:
- Error handling (catch-all with proper logging)
- Validation (Zod schemas for all inputs)
- Rate limiting (for API protection)
- CORS (for frontend access)

Generate complete, production-ready code with:
- Proper error handling
- Input validation
- Logging
- Comments explaining complex logic
- No placeholder code
```

**Expected Output:**
- `app.js` - Main Express setup
- `src/routes/*.js` - All API routes
- `src/services/*.js` - Business logic
- `src/integrations/*.js` - External API integrations
- `src/middleware/*.js` - Express middleware
- `package.json` - All dependencies
- `.env.example` - Configuration template

---

### **Prompt 4: Hunter.io & Web Scraping Integration**

```
Implement complete lead enrichment pipeline:

HUNTER.IO INTEGRATION:
- Extract domain from email
- Fetch company info (employees, technologies, funding)
- Get email verification data
- Handle API rate limits and errors
- Cache results to avoid duplicate calls

WEB SCRAPING (Cheerio):
- Scrape company homepage for:
  * Meta descriptions
  * Company name & tagline
  * Social media links
  * Technology stack (React, Node, Python detection)
  * Contact information
- Timeout handling (5 second max)
- Graceful fallback if page unavailable

SCORING ALGORITHM:
- Email found: +20 points
- Hunter.io data available: +25 points
- Company website accessible: +15 points
- Tech stack detected: +15 points
- Social links found: +10 points
- Phone number: +10 points
- LinkedIn profile: +5 points
- Max score: 100 points

ASYNC PROCESSING:
- Use Bull queue for background enrichment
- Store enrichment logs for audit trail
- Handle failures gracefully with retry logic

Generate complete, tested code with error handling.
```

**Expected Output:**
- `src/integrations/hunterIO.js` - Hunter.io client
- `src/integrations/webScraper.js` - Web scraping logic
- `src/services/enrichmentService.js` - Orchestration
- `src/services/scoringService.js` - Lead scoring
- `tests/enrichment.test.js` - Test suite

---

## **PHASE 3: FRONTEND IMPLEMENTATION (React)**

### **Prompt 5: React Frontend Setup**

```
Create a modern React 18 frontend with:

PROJECT STRUCTURE:
- src/components/ (React components)
- src/hooks/ (Custom hooks)
- src/services/ (API clients)
- src/stores/ (Zustand state management)
- src/styles/ (Tailwind CSS configuration)
- src/utils/ (Helper functions)

CORE COMPONENTS:
1. LeadTable.jsx
   - TanStack Table v8 integration
   - Sorting, pagination, filtering
   - Inline editing for status
   - Actions (edit, delete, enrich)
   - Virtual scrolling for 10k+ rows

2. CSVImport.jsx
   - Drag-drop file upload
   - Progress indicator
   - Validation error display
   - Success notification

3. CSVExport.jsx
   - Filter options (status, enrichment_status, score)
   - Custom field selection
   - Export button with loading state

4. LeadForm.jsx
   - Create/edit lead modal
   - Dynamic custom field rendering
   - Form validation
   - Auto-save draft capability

5. CustomFieldBuilder.jsx
   - Drag-drop field creation
   - Field type selector (text, number, select, date, boolean)
   - Required/unique flags
   - Edit/delete fields

6. EnrichmentWidget.jsx
   - Single lead enrichment button
   - Bulk enrichment interface
   - Enrichment status indicator
   - Show enriched data modal

7. Dashboard.jsx
   - Header with logo
   - Navigation
   - Statistics (total leads, enriched %, avg score)
   - Main content area

STATE MANAGEMENT (Zustand):
- leads store (list, loading, error states)
- UI store (modals, filters, pagination)
- Custom fields store (available fields, schemas)

API INTEGRATION:
- Axios for all HTTP calls
- Error handling & retry logic
- Request/response interceptors
- Loading states for all operations

STYLING:
- Tailwind CSS with modern design system
- Responsive (mobile-first)
- Dark mode ready
- Smooth transitions & animations

Generate complete, production-ready React code.
```

**Expected Output:**
- `public/index.html`
- `src/App.jsx`
- `src/index.js`
- `src/components/*.jsx` - All components
- `src/hooks/useLeads.js` - Lead data hook
- `src/services/api.js` - API client
- `src/stores/leadStore.js` - Zustand store
- `src/styles/index.css` - Tailwind config
- `tailwind.config.js`
- `package.json` - Dependencies

---

### **Prompt 6: TanStack Table Advanced Implementation**

```
Implement an ultra-performant TanStack Table with:

FEATURES:
- Virtual scrolling (handle 10k+ rows without lag)
- Client-side sorting (multi-column)
- Global & column filtering
- Pagination (50 rows per page)
- Column resizing (user-draggable)
- Column visibility toggle
- Row selection (batch operations)
- Inline cell editing (status field)
- Keyboard navigation (Tab, Arrow keys)

COLUMNS:
- First Name (sortable, searchable)
- Email (clickable for mailto)
- Company (link to company detail)
- Status (editable select: new/contacted/qualified/won/lost)
- Score (visual progress bar, 0-100)
- Enrichment Status (icon: ✓ enriched, ○ pending, ✗ failed)
- Updated At (relative time: "2 hours ago")
- Actions (Edit, Enrich, Delete buttons)

PERFORMANCE OPTIMIZATIONS:
- useMemo for column definitions
- useCallback for event handlers
- Lazy load enrichment details on demand
- Debounce search input (300ms)

KEYBOARD SHORTCUTS:
- Ctrl+F: Focus search
- Ctrl+A: Select all
- Delete: Delete selected
- E: Enrich selected
- Esc: Clear selection

Make it fast and user-friendly. No lag on 10k rows.
```

**Expected Output:**
- `src/components/LeadTable.jsx` - Complete implementation
- `src/hooks/useTableState.js` - Table state management
- `src/utils/tableUtils.js` - Helper functions

---

## **PHASE 4: DATA PIPELINES (Import/Export/Enrichment)**

### **Prompt 7: CSV Import Pipeline**

```
Build a robust CSV/Excel import system:

VALIDATION LAYER:
- Detect file type (CSV, XLSX)
- Parse headers and validate required fields
- Type detection (email format, phone format, date format)
- Duplicate detection (by email)
- Data sanitization (trim whitespace, normalize case)

ERROR HANDLING:
- Show line-by-line errors in UI
- Skip invalid rows but continue import
- Summary report: "Imported 95/100 rows, 5 errors"
- Allow user to download error report as CSV

MAPPING:
- Auto-detect common headers (first_name, email, etc.)
- Allow manual mapping if headers don't match
- Support custom field mapping
- Preview first 5 rows before import

BATCH PROCESSING:
- Process files up to 50MB
- Import 1000 rows per second
- Show progress bar (%) and ETA
- Callback updates every 100 rows

POST-IMPORT:
- Automatically trigger enrichment for imported leads
- Option to skip enrichment
- Mark imported_at timestamp
- Create audit log entry

STORAGE:
- Atomic transaction (all or nothing)
- Rollback on critical error
- Keep original file for audit trail

Generate production-ready code with proper error handling.
```

**Expected Output:**
- `src/services/csvImportService.js`
- `src/components/CSVImport.jsx`
- `src/utils/csvValidation.js`
- Tests for import logic

---

### **Prompt 8: CSV Export Pipeline**

```
Build a flexible CSV export system:

FILTER OPTIONS:
- By status (new, contacted, qualified, won, lost)
- By enrichment status (pending, enriched, failed)
- By lead score (min-max range)
- By company
- By owner (if multi-user)
- Date range (created_at, updated_at)
- Free-text search in name/email

COLUMN SELECTION:
- Show all available columns (standard + custom fields)
- Checkbox to select/deselect columns
- Drag to reorder column export order
- Save export template for reuse

FLATTENING:
- Convert JSONB custom_fields into separate columns
- Flatten enrichment_data into readable format
  * company_name, company_domain, company_size
  * tech_stack (comma-separated)
  * social_links (separate columns)
- Format timestamps in user locale

EXPORT FORMATS:
- CSV (RFC 4180)
- XLSX (with styling)
- Tab-separated (TSV)

FEATURES:
- Download with filename: "leads-YYYY-MM-DD.csv"
- Generate in background (async) for large exports
- Show file size before download
- Stream directly to browser (no temp file storage)

PERFORMANCE:
- Handle 50k+ rows without memory issues
- Progress callback for large exports

Generate production-ready code.
```

**Expected Output:**
- `src/services/csvExportService.js`
- `src/components/CSVExport.jsx`
- `src/utils/csvFormatting.js`

---

### **Prompt 9: Custom Field Management**

```
Build a flexible custom field system:

FIELD DEFINITION:
- Entity type: lead, company, deal
- Field name: alphanumeric (validated)
- Field type: text, number, select, multiselect, date, boolean, url, email
- Validation: required, unique, min/max length, regex pattern
- UI hints: placeholder, help text, tooltip
- Options: for select/multiselect types
- Metadata: description, category, display order

STORAGE:
- Store field definitions in custom_fields table
- Store values in JSONB columns on entities
- Auto-migrate existing data when adding required fields

VALIDATION:
- Enforce required fields on create/update
- Validate field types and constraints
- Prevent duplicate field names per entity type
- Validate unique fields across table

UI BUILDER:
- No-code field creator
- Drag-drop field reordering
- Real-time preview of form
- Edit/delete existing fields
- Show usage count (how many leads have this field)

FORM RENDERING:
- Dynamically render form fields based on custom_field definitions
- Preserve values during editing
- Show validation errors inline
- Support conditional field visibility

MIGRATION:
- Handle adding required fields to existing rows
- Support field type changes (with conversion)
- Archive deleted fields (soft delete)

Generate complete, tested code.
```

**Expected Output:**
- `src/services/customFieldService.js`
- `src/components/CustomFieldBuilder.jsx`
- `src/components/DynamicForm.jsx`
- `src/utils/fieldValidation.js`

---

## **PHASE 5: DEPLOYMENT & TESTING**

### **Prompt 10: Docker Setup & Deployment**

```
Create production-ready Docker setup:

docker-compose.yml:
- PostgreSQL service (Antigravity database)
- Redis service (caching & queues)
- Backend service (Node.js/Express)
- Frontend service (React build)
- Nginx reverse proxy

CONFIGURATION:
- Environment variables (.env.production)
- Database migrations on startup
- Health checks for all services
- Volume mounts for data persistence
- Network isolation

BACKEND DOCKERFILE:
- Node 18 base image
- Minimal layers (multistage build)
- Install dependencies
- Healthcheck endpoint
- Graceful shutdown

FRONTEND DOCKERFILE:
- Build stage (Node 18)
- Production stage (Nginx)
- Gzip compression
- Cache headers
- Single Page App routing

PRODUCTION READINESS:
- SSL/TLS termination (Nginx)
- Environment-specific configs
- Logging setup (Winston)
- Error monitoring setup
- Database backup strategy

Generate complete Docker setup with documentation.
```

**Expected Output:**
- `docker-compose.yml`
- `Dockerfile.backend`
- `Dockerfile.frontend`
- `.dockerignore`
- `nginx.conf`
- `.env.production.example`
- `DEPLOYMENT.md`

---

### **Prompt 11: Testing & QA**

```
Create comprehensive test suites:

BACKEND TESTS:
- Lead CRUD operations (Jest + Supertest)
- CSV import validation (edge cases: empty file, large file, bad data)
- CSV export filtering & formatting
- Custom field validation
- Enrichment service mocking (Hunter.io, web scraper)
- Error handling paths
- Database constraint tests
- Concurrent request handling

FRONTEND TESTS:
- Component rendering (React Testing Library)
- User interactions (click, type, submit)
- TanStack Table functionality (sort, filter, paginate)
- Form validation
- Modal open/close
- CSV upload progress
- Error state displays

E2E TESTS (Playwright):
- Login flow (if auth exists)
- Import 10 leads from CSV
- Search for lead by email
- Edit lead status
- Enrich single lead
- Export filtered leads to CSV
- Add custom field
- Verify field appears in form

COVERAGE TARGETS:
- Backend: 80%+ line coverage
- Frontend: 70%+ component coverage
- E2E: Happy path + critical flows

PERFORMANCE TESTS:
- TanStack Table with 10k rows: <100ms render
- CSV import 1000 rows: <2 seconds
- CSV export 50k rows: <5 seconds
- Enrichment API call: <2 seconds (with Hunter.io)

Generate complete, maintainable test code.
```

**Expected Output:**
- `tests/backend/*.test.js` - Backend tests
- `tests/frontend/*.test.jsx` - Frontend tests
- `tests/e2e/*.spec.js` - E2E tests
- `jest.config.js`
- `playwright.config.js`
- `TESTING.md`

---

## **PHASE 6: ADVANCED FEATURES & OPTIMIZATION**

### **Prompt 12: Performance Optimization**

```
Optimize for production scale (100k+ leads):

DATABASE OPTIMIZATION:
- Analyze slow queries with EXPLAIN ANALYZE
- Create missing indexes on enrichment_status, score
- Partition leads table by created_at (monthly)
- Vacuum and analyze regularly
- Set up query monitoring

BACKEND OPTIMIZATION:
- Implement Redis caching for:
  * Top 100 leads (by score)
  * Custom field definitions
  * Enrichment results (TTL: 1 hour)
- Connection pooling (max 20 connections)
- Gzip compression for API responses
- Enable HTTP/2
- Optimize CSV parsing (streams instead of arrays)

FRONTEND OPTIMIZATION:
- Code splitting (lazy load components)
- TanStack Table virtual scrolling
- Memoization of expensive components
- Image optimization (no images, but icons)
- Debounce search (300ms)
- Cancel in-flight requests on unmount
- Bundle size analysis & optimization

MONITORING:
- APM (Application Performance Monitoring) setup
- Database query monitoring
- Frontend error tracking (Sentry)
- Performance metrics (Core Web Vitals)
- Uptime monitoring

Generate optimization code and monitoring setup.
```

**Expected Output:**
- Query optimization scripts
- Redis caching implementation
- Frontend optimizations
- Monitoring & alerting configuration
- PERFORMANCE.md with metrics

---

## **PHASE 7: ADVANCED ENRICHMENT (Optional)**

### **Prompt 13: ML-Based Lead Scoring**

```
Implement advanced lead scoring with:

FEATURE ENGINEERING:
- Company size (startup, SMB, enterprise)
- Technology stack match (your company's tech)
- Industry relevance
- Company age & funding status
- Email domain reputation
- Activity signals (if tracking)
- Engagement metrics

SCORING MODELS:
1. Rule-based (current system)
2. ML model (scikit-learn or TensorFlow.js)
   - Train on historical conversion data
   - Features: company size, industry, tech stack, engagement
   - Output: probability score (0-100)

DEPLOYMENT:
- Save model as ONNX or TensorFlow.js format
- Load in Node.js backend
- Inference per lead: <100ms
- Batch prediction for bulk enrichment

MONITORING:
- Track prediction accuracy over time
- Retraining pipeline (monthly)
- Feedback loop (mark leads as won/lost)

Generate complete, production-ready ML implementation.
```

---

## **EXECUTION WORKFLOW IN ANTIGRAVITY**

### **Step-by-Step Agent Instructions**

1. **Start with Prompt 1** (Architecture Scoping)
   - Use **Planning Mode** (deep analysis)
   - Review Task and Implementation artifacts
   - Approve before agent proceeds

2. **Execute Prompts 2-4** (Database & Backend)
   - Use **Agent Manager** or **Editor** with Agent side panel
   - Review generated files
   - Ask for fixes with comments on artifacts
   - Test routes with curl (ask agent to create test script)

3. **Execute Prompts 5-6** (Frontend)
   - Use **Editor** with Agent panel
   - Test React components in browser (agent launches it)
   - Provide feedback on UI/UX
   - Ask agent to iterate on styling

4. **Execute Prompts 7-9** (Data Pipelines)
   - Test CSV import with sample file
   - Test CSV export filtering
   - Verify enrichment results

5. **Execute Prompt 10** (Deployment)
   - Build Docker images
   - Run docker-compose up
   - Verify all services healthy

6. **Execute Prompt 11** (Testing)
   - Run tests in CI/CD pipeline
   - Fix failing tests with agent help

---

## **RULES & WORKFLOWS (Antigravity Configuration)**

### **Global Rules** (in ~/.gemini/GEMINI.md or workspace)

```markdown
# Code Generation Rules

* All code follows clean code principles
* Every function has JSDoc or Python docstring comments
* No console.logs in production code (use structured logging)
* Error handling is comprehensive (try/catch with specific error types)
* Input validation on all API endpoints (use Zod or similar)
* All asynchronous operations are properly handled (no unhandled rejections)
* Database queries use parameterized statements (prevent SQL injection)
* React components use proper prop validation (PropTypes or TypeScript)
* CSS follows Tailwind conventions (no inline styles)
* Git commits are atomic and well-described
```

### **Workflow: Database-First Design**

```
/database-first
When designing database tables, always consider:
1. Normalization (avoid duplication)
2. Indexing (for common query patterns)
3. Foreign key constraints
4. Soft deletes where appropriate
5. Audit timestamps (created_at, updated_at)
```

### **Workflow: Test-Driven**

```
/test-first
Before implementing a feature:
1. Write failing tests (Jest/Playwright)
2. Wait for my approval
3. Implement code to make tests pass
4. Refactor for clarity
```

### **Workflow: Code Review**

```
/code-review
After generating code:
1. Show me a summary Artifact
2. Highlight important changes
3. List potential issues
4. Wait for my feedback before finalizing
```

---

## **QUICK REFERENCE: KEY PROMPTS**

```
# Add a new feature
"Add [feature] to the CRM. Generate tests first, then implement."

# Fix a bug
"The [component] is broken. Trace the error, fix it, test it."

# Optimize performance
"Optimize [module] to handle 100k leads. Show before/after metrics."

# Add enrichment source
"Add [data source] to the enrichment pipeline. Integrate with [API]."

# Scale database
"Design migration to partition leads table by date. Zero downtime."

# Review code quality
"Audit codebase for security, performance, and maintainability issues."
```

---

**You now have a complete Antigravity agent workflow to build your CRM end-to-end.**

**Key Points:**
- Give prompts in sequence
- Review artifacts before approval
- Use Agent Manager for high-level orchestration
- Use Editor with Agent panel for detailed work
- Configure Rules & Workflows for consistency
- Let agents iterate based on your feedback

**Estimated Timeline:**
- Phase 1: 2 hours (planning)
- Phase 2-3: 8 hours (backend + frontend)
- Phase 4: 4 hours (pipelines)
- Phase 5-6: 4 hours (deployment + testing)
- Phase 7: 2-4 hours (advanced features)

**Total: ~24-28 hours of agent-assisted development** ✅