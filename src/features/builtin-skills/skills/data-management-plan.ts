import type { BuiltinSkill } from "../types"

export const DATA_MANAGEMENT_PLAN_SKILL_NAME = "data-management-plan"

export const DATA_MANAGEMENT_PLAN_SKILL_DESCRIPTION =
  "Data management planning: FAIR principles, DMP templates (Horizon Europe, NSF, UKRI), data governance, open data repositories, metadata standards, data lifecycle management, GDPR compliance for research data. Triggers: 'DMP', 'data management plan', 'FAIR data', 'open data', 'data governance', 'metadata', 'data repository'."

export const dataManagementPlanSkill: BuiltinSkill = {
  name: DATA_MANAGEMENT_PLAN_SKILL_NAME,
  description: DATA_MANAGEMENT_PLAN_SKILL_DESCRIPTION,
  template: `# Data Management Plan — Comprehensive Reference

## FAIR PRINCIPLES

| Principle | Requirement | Implementation |
|-----------|-------------|----------------|
| **Findable** | Persistent identifier, rich metadata, indexed | DOI via Zenodo/Figshare, discipline-specific metadata schema |
| **Accessible** | Retrievable by identifier, open protocol | Standard HTTP/API access, authentication if restricted |
| **Interoperable** | Formal knowledge representation, linked vocabularies | Standard formats (CSV, JSON, HDF5), ontologies, controlled vocabularies |
| **Reusable** | Clear license, provenance, community standards | CC-BY 4.0, detailed methodology, domain-specific standards |

### FAIR Assessment Checklist
- [ ] Data has a globally unique persistent identifier (DOI, Handle)
- [ ] Metadata describes the data richly (who, what, when, where, how)
- [ ] Data is registered/indexed in a searchable resource
- [ ] Data is retrievable by its identifier using standard protocol
- [ ] Access conditions are clearly stated (open/embargoed/restricted)
- [ ] Data uses formal, shared vocabulary/ontology
- [ ] Data uses FAIR-compliant formats (not proprietary binaries)
- [ ] Data has clear usage license
- [ ] Data has detailed provenance information
- [ ] Data meets domain-relevant community standards

## DMP STRUCTURE (Horizon Europe Template)

### 1. Data Summary
| Field | Content |
|-------|---------|
| **Purpose** | What data will be generated/collected and for what purpose |
| **Types and formats** | File formats, estimated volume, data types |
| **Re-use of existing data** | Third-party datasets used, licenses |
| **Origin** | How data is generated (sensors, simulation, survey, etc.) |
| **Expected size** | Estimated total data volume |
| **Utility** | Who will find the data useful (beyond the project) |

### 2. FAIR Data
**Findable:**
- Naming conventions and versioning scheme
- Search keywords and metadata standards used
- Repository where data will be deposited

**Accessible:**
- Repository and access method
- Any access restrictions and justification
- Timeline for data availability (embargo period if any)

**Interoperable:**
- Standard vocabularies/ontologies used
- File formats and why they were chosen
- Mappings to other datasets

**Reusable:**
- License (CC-BY 4.0 recommended for Horizon Europe)
- Quality assurance processes
- Documentation for third-party reuse

### 3. Other Research Outputs
- Software: version control (Git), license (MIT/Apache/GPL), repository (GitHub/GitLab)
- Models: trained model weights, architecture description, training parameters
- Protocols: step-by-step experimental procedures
- Workflows: computational pipelines, container definitions (Docker)

### 4. Allocation of Resources
- Costs for data storage, curation, and long-term preservation
- Personnel responsible for data management
- Costs for making data FAIR (metadata creation, format conversion)

### 5. Data Security
- Data protection measures (encryption, access control, backup)
- GDPR compliance (if personal data involved)
- Data transfer protocols (secure channels)
- Physical security of storage infrastructure

### 6. Ethics
- Personal data handling (anonymization, pseudonymization)
- Informed consent for data sharing
- Sensitive data protocols
- Ethics committee approval reference

### 7. Other
- National/funder-specific requirements
- Institutional data policy compliance
- Data management training plans

## FUNDER-SPECIFIC REQUIREMENTS

### Horizon Europe
- DMP is a **mandatory deliverable** (typically D1.1 or D1.2)
- First version due within 6 months of project start
- Updated versions as the project evolves
- Open Access mandate: publications via Green or Gold OA
- Research data: "as open as possible, as closed as necessary"
- Use of the **Horizon Europe DMP template** (via EC Funding & Tenders portal)

### NSF
- **Data Management Plan**: 2-page limit, required with every proposal
- Must describe: types of data, standards, access/sharing policies, archiving
- Data sharing expected within a "reasonable time" after publication
- No specific template — discipline-specific expectations

### UKRI
- Data Management Plan required at application stage
- Open data expected within 12 months of generation
- Minimum 10-year retention
- Use of disciplinary repositories preferred

## DATA REPOSITORIES

### Generalist Repositories
| Repository | Features | Limit | DOI |
|------------|----------|-------|-----|
| **Zenodo** | CERN-hosted, any discipline, versioning | 50 GB per dataset | Yes |
| **Figshare** | Any file type, institutional integration | 20 GB per file (free) | Yes |
| **Dryad** | Research data associated with publications | No hard limit (fee-based) | Yes |
| **OSF** | Open Science Framework, project management + storage | 5 GB per file, 50 GB per project | Yes |
| **Harvard Dataverse** | Social science focus, rich metadata | 2.5 GB per file (free) | Yes |

### Discipline-Specific Repositories
| Domain | Repository | Content |
|--------|-----------|---------|
| Genomics | GenBank, SRA, ENA | Sequences, reads |
| Proteomics | PRIDE, ProteomeXchange | Mass spec data |
| Neuroimaging | OpenNeuro, NITRC | Brain imaging (fMRI, EEG) |
| Geoscience | PANGAEA | Earth & environmental data |
| Social Science | ICPSR, UK Data Service | Survey data, qualitative data |
| Astronomy | NASA archives, ESO | Observational data |
| Machine Learning | HuggingFace, Papers with Code | Models, datasets, benchmarks |

## METADATA STANDARDS

| Standard | Domain | Use |
|----------|--------|-----|
| **Dublin Core** | General | Basic descriptive metadata (15 elements) |
| **DataCite** | Research data | DOI registration metadata |
| **Schema.org** | Web | Structured data for search engines |
| **DDI** | Social science | Surveys, questionnaires, codebooks |
| **ISO 19115** | Geospatial | Geographic metadata |
| **METS/MODS** | Libraries/archives | Digital object preservation |
| **DCAT** | Data catalogs | Dataset discovery and access |

## DATA LIFECYCLE

\`\`\`
  Plan → Collect → Process → Analyze → Preserve → Share → Reuse
    │                                       │          │
    └── DMP created ◄──────────────────────┘          │
                                                       │
    └── DMP updated ◄─────────────────────────────────┘
\`\`\`

### Retention & Archiving
| Funder/Context | Minimum Retention |
|----------------|-------------------|
| Horizon Europe | Duration of the project + open access after |
| NSF | 3 years beyond award end (minimum) |
| UKRI | 10 years minimum |
| General best practice | 10 years or as long as data has value |
| Clinical data | 15-25 years (regulatory dependent) |

### Data Destruction
- Document what was destroyed and when
- Justify destruction (e.g., consent expiry, legal requirement)
- Use secure deletion methods for sensitive data
- Retain metadata even if data is destroyed

## GDPR FOR RESEARCH DATA

### Lawful Basis for Processing
- **Consent** (Article 6(1)(a)): most common for research
- **Legitimate interest** (Article 6(1)(f)): balance test required
- **Public interest** (Article 6(1)(e) + Article 89): research exemption

### Key Requirements
| Requirement | Action |
|-------------|--------|
| **Data minimization** | Collect only what's needed for the research question |
| **Purpose limitation** | Process only for the stated research purpose |
| **Storage limitation** | Don't keep identifiable data longer than necessary |
| **Anonymization** | Remove all identifying information where possible |
| **Pseudonymization** | Replace identifiers with codes, keep key separate |
| **DPIA** | Data Protection Impact Assessment for high-risk processing |
| **Records of processing** | Document what data, why, how long, who has access |
| **Cross-border transfers** | Adequacy decision, SCCs, or derogation for research |`,
}
