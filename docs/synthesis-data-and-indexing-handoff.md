# SynThesis Data and Local Indexing Handoff

**Updated:** July 21, 2026  
**Scope:** `backend/data/synthesis_research_data.json` and `backend/build_index.py`

This document records the data-structure and indexing changes made for SynThesis. It is intended for the team member maintaining the research corpus, methodology, tools, and local embedding index.

## What changed

### 1. Record IDs are neutral and globally unique

Research records now use one sequential ID series:

```json
"id": "research_001"
```

The ID identifies a record only. It does **not** encode whether the work belongs to faculty or students. The `type` field provides that distinction:

```json
"type": "faculty_paper"
```

or:

```json
"type": "student_paper"
```

The current corpus has 27 unique records: `research_001` through `research_027`.

### 2. Faculty and student record conventions

| Field | Faculty paper | Student paper |
|---|---|---|
| `type` | `faculty_paper` | `student_paper` |
| `mentor` | `null` | Name of the thesis mentor/adviser, if available |
| `department` | Preserved from source data; not changed by this cleanup | `CCSMA` |
| `program` | Preserved from source data; not changed by this cleanup | `BS Computer Science with Specialization in Data Science` |
| `publication`, `doi`, `scopus_id` | Preserved from source data | Present with a `null` value until verified metadata is available |

This separation supports adviser/faculty relevance ranking: student papers provide mentoring evidence, while faculty papers provide authorship/research-expertise evidence.

### 3. Methodology was cleaned using the abstracts

`methodology` now contains only methods actually applied to address the study problem:

- Algorithms and ML models, such as `XGBoost`, `DBSCAN`, `SMOTE`, and `ConvLSTM`
- Applied problem-solving methods, such as `Forward Chaining Algorithm` and `Canny Edge Detection`
- For non-system studies, the actual research method, such as `Systematic Literature Review (SLR)` or `Cluster-Randomized Controlled Trial`

The following kinds of entries were removed from `methodology`:

- Evaluation standards and metrics, such as ISO/IEC 25010 and Cohen's Kappa
- Data-collection labels, such as `survey`
- Generic labels, such as `machine learning`, `hyperparameter tuning`, and `experimental design`
- Theoretical frameworks, such as TAM and TPB
- Software, hardware, platforms, and implementation technologies, such as TensorFlow, Python, Raspberry Pi, SAP 2000, sensors, and CMS

`research_018` has an empty methodology array because its abstract does not state an applied algorithm, model, or formal research method. Do not invent a methodology solely to fill the field.

### 4. A `tools` key was added to every record

`tools` holds only explicitly stated software or hardware used by the study. It does not duplicate ML models and algorithms stored in `methodology`.

When an abstract does not explicitly state a software or hardware tool, the value is `null`:

```json
"tools": null
```

When tools are explicitly stated, the value is a string array:

```json
"tools": ["SAP 2000"]
```

This conservative approach is intentional. The current Paraverse-derived faculty-research metadata often does not explicitly name the software or hardware used in an abstract. A `null` value means **not stated in the available abstract**; it does not mean the research used no tools.

### 5. Local embedding-index builder was added

[`backend/build_index.py`](../backend/build_index.py) creates the two generated indexing artifacts:

```text
backend/data/embeddings.json
backend/data/index_manifest.json
```

| File | Purpose |
|---|---|
| `synthesis_research_data.json` | Human-maintained source of truth for research metadata |
| `embeddings.json` | One embedding vector per research record |
| `index_manifest.json` | Build time, model, vector dimension, record count, and integrity hashes |
| `build_index.py` | Script that validates records, creates/reuses embeddings, and writes both generated files |

The builder produces a retrieval representation from each record's title, author, mentor, program, department, domain, keywords, methodology, tools, datasets, abstract, and publication. It stores a hash of this retrieval text with each vector.

On a normal re-run, unchanged records reuse their previous vectors. Records with changed retrieval text and newly added records are embedded again. Use `--force` only when every vector must be rebuilt, for example after changing the embedding model or retrieval-text logic.

## Current JSON record structure

Every research record now follows this shape. Values may be `null` where the source does not provide verified information.

```json
{
  "id": "research_001",
  "type": "faculty_paper",
  "title": "Research title",
  "author": "Author or authors as provided by the source",
  "year": 2026,
  "mentor": null,
  "department": null,
  "program": null,
  "abstract": "Research abstract",
  "datasets": ["Dataset or data source"],
  "keywords": ["keyword"],
  "methodology": ["Applied algorithm, model, or research method"],
  "tools": ["Explicitly stated software or hardware"],
  "domain": "Machine Learning",
  "publication": "Publication metadata or null",
  "doi": "DOI or null",
  "scopus_id": "Scopus ID or null"
}
```

For a record without explicitly named tools:

```json
"tools": null
```

## Methodology and tools inventory

This is the current audit result. The methodology entries were derived from the record abstracts. Tool entries were included only when the abstract explicitly identified software or hardware.

| Research ID | Methodology | Tools |
|---|---|---|
| `research_001` | mBERT; XLM-RoBERTa; GPT; Progressive Fine-Tuning; Ensemble Learning | `null` |
| `research_002` | Artificial Neural Network (ANN); Garson's Algorithm | `null` |
| `research_003` | Artificial Neural Network (ANN); Particle Swarm Optimization (PSO); Levenberg-Marquardt Algorithm; Garson's Algorithm | SAP 2000 |
| `research_004` | Systematic Literature Review (SLR) | `null` |
| `research_005` | Structural Equation Modeling (SEM); Artificial Neural Network (ANN) | `null` |
| `research_006` | Rule-Based Algorithm | `null` |
| `research_007` | Decision-Based Recommendation | `null` |
| `research_008` | Forward Chaining Algorithm; Fuzzy IF-THEN-ELSE Rules | `null` |
| `research_009` | Random Forest; Support Vector Machine (SVM); Gradient Boosting; Extreme Gradient Boosting (XGBoost); K-Nearest Neighbors (KNN); Decision Tree | `null` |
| `research_010` | K-Nearest Neighbors (KNN); XGBoost; Support Vector Machine (SVM) | `null` |
| `research_011` | XGBoost | `null` |
| `research_012` | Decision Tree; Random Forest; Gradient Boosting; XGBoost; K-Nearest Neighbors (KNN); Support Vector Machine (SVM) | `null` |
| `research_013` | Structured Narrative Review | `null` |
| `research_014` | Gaussian Process Regression; Bayesian Optimization | `null` |
| `research_015` | Region-Based Segmentation; Canny Edge Detection; Pixel Ratio Computation | CCTV Camera |
| `research_016` | Face Recognition | Raspberry Pi; Face Recognition Camera |
| `research_017` | Image Processing | Camera; TensorFlow; Python 3.7; Ultrasonic Sensor; GSM Module; Solar Panel |
| `research_018` | *(none explicitly stated)* | `null` |
| `research_019` | Project-Based Learning (PBL) | Four-Storey Elevator Trainer; Programmable Logic Controller (PLC); Human Machine Interface (HMI) |
| `research_020` | Cognitive Diagnostic Modeling (CDM); Linear Logistic Model (LLM) | `null` |
| `research_021` | Rapid Review | `null` |
| `research_022` | Cluster-Randomized Controlled Trial | `null` |
| `research_023` | Developmental Evaluation | `null` |
| `research_024` | Simulated Lived Experience; Thematic Analysis | `null` |
| `research_025` | 2x2 Factorial Design | `null` |
| `research_026` | XGBoost; ConvLSTM; Meta-Stacked Ensemble; Spatial Weighting; Background Sampling | Pyton, PHP, DigitalOcean, Railway |
| `research_027` | XGBoost; DBSCAN; SMOTE | Pyton, Djang, SQLite, Railway |

### Records with extracted tools

```text
research_003, research_015, research_016, research_017, research_019, research_026, research_027
```

### Records with `tools: null`

```text
research_001, research_002, research_004, research_005, research_006,
research_007, research_008, research_009, research_010, research_011,
research_012, research_013, research_014, research_018, research_020,
research_021, research_022, research_023, research_024, research_025
```

## How to build or rebuild the local index on Windows

Run these commands from the project root in PowerShell.

### 1. Confirm prerequisites

Install Python 3.10 or newer. Confirm that Python is available:

```powershell
python --version
```

If this command is not found, install Python and ensure **Add Python to PATH** is selected during installation. Open a new PowerShell window after installation.

### 2. Move to the backend folder

```powershell
cd backend
```

### 3. Create a virtual environment

```powershell
python -m venv venv
```

### 4. Activate the virtual environment

```powershell
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks script execution for this terminal session, run the following once, then activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

You should now see `(venv)` at the beginning of the command prompt.

### 5. Install backend dependencies

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 6. Ensure the environment file is present

The index builder needs an embedding API key. Create the local file if it does not exist:

```powershell
Copy-Item .env.example .env
```

Open `backend/.env` and configure provider:

```env
# API Creds
AIML_API_KEY = your_openai_api_key_here
AIMLAPI_BASE_URL = 
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=
```

Keep the configured embedding model aligned with the project:

```env
SYNTHESIS_EMBED_MODEL=text-embedding-3-small
```

Never commit `backend/.env` because it contains a secret API key.

### 7. Validate the planned build first

This reads and validates the corpus but does not call the embedding API or write output files:

```powershell
python build_index.py --dry-run
```

Expected summary for the current corpus:

```text
Records: 27 | unchanged vectors reused: 0 | vectors to create: 27
Dry run complete. No embedding API call or file write was made.
```

### 8. Build the embeddings and manifest

```powershell
python build_index.py
```

The first successful build creates:

```text
backend/data/embeddings.json
backend/data/index_manifest.json
```

The terminal prints each embedding batch and finishes with the locations of both generated files.

### 9. Rebuild after research-data edits

Whenever a title, abstract, keyword, methodology, tool, dataset, domain, author, mentor, program, department, or publication changes—or when a research record is added—run:

```powershell
python build_index.py
```

The script reuses unchanged vectors and embeds only new or changed records.

To intentionally re-embed every record:

```powershell
python build_index.py --force
```

Use `--force` after changing `SYNTHESIS_EMBED_MODEL` or changing the retrieval-text rules in `build_index.py`.
