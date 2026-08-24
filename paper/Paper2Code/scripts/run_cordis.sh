# PaperCoder run for the Cordis paper ("A Programming Paradigm for
# Spatiotemporal Composability"). Adapted from scripts/run.sh.
#
# The paper was converted from paper.pdf with tools/pdf_to_s2orc_json.py
# (S2ORC-style JSON; the official Grobid path is a heavy Java dependency).
#
# Backend: DeepSeek API (OpenAI-compatible) with deepseek-v4-flash and
# high reasoning effort. Credentials live in ../.env (OPENAI_API_KEY +
# OPENAI_BASE_URL), sourced below.
#
#   bash scripts/run_cordis.sh   (run from the scripts/ directory)

set -e

# shellcheck disable=SC1091
set -a; source ../.env; set +a

GPT_VERSION="deepseek-v4-flash"

PAPER_NAME="Cordis"
PDF_JSON_PATH="../examples/Cordis_paper.json" # .json
PDF_JSON_CLEANED_PATH="../examples/Cordis_paper_cleaned.json" # _cleaned.json
OUTPUT_DIR="../outputs/Cordis"
OUTPUT_REPO_DIR="../outputs/Cordis_repo"

mkdir -p $OUTPUT_DIR
mkdir -p $OUTPUT_REPO_DIR

echo $PAPER_NAME

echo "------- Preprocess -------"

../venv/bin/python ../codes/0_pdf_process.py \
    --input_json_path ${PDF_JSON_PATH} \
    --output_json_path ${PDF_JSON_CLEANED_PATH}

echo "------- PaperCoder: 1. Planning -------"

../venv/bin/python ../codes/1_planning.py \
    --paper_name $PAPER_NAME \
    --gpt_version ${GPT_VERSION} \
    --pdf_json_path ${PDF_JSON_CLEANED_PATH} \
    --output_dir ${OUTPUT_DIR}

echo "------- PaperCoder: 1.1 Config extraction -------"

../venv/bin/python ../codes/1.1_extract_config.py \
    --paper_name $PAPER_NAME \
    --output_dir ${OUTPUT_DIR}

cp -rp ${OUTPUT_DIR}/planning_config.yaml ${OUTPUT_REPO_DIR}/config.yaml

echo "------- PaperCoder: 2. Analyzing -------"

../venv/bin/python ../codes/2_analyzing.py \
    --paper_name $PAPER_NAME \
    --gpt_version ${GPT_VERSION} \
    --pdf_json_path ${PDF_JSON_CLEANED_PATH} \
    --output_dir ${OUTPUT_DIR}

echo "------- PaperCoder: 3. Coding -------"

../venv/bin/python ../codes/3_coding.py \
    --paper_name $PAPER_NAME \
    --gpt_version ${GPT_VERSION} \
    --pdf_json_path ${PDF_JSON_CLEANED_PATH} \
    --output_dir ${OUTPUT_DIR} \
    --output_repo_dir ${OUTPUT_REPO_DIR}

echo "------- Done: see ${OUTPUT_REPO_DIR} -------"
