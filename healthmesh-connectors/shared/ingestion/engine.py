import os
import re
import pandas as pd
import numpy as np
from io import BytesIO
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
from sqlalchemy import Column, String, Integer, Float, DateTime, Text
from shared.database.session import Base

# Common Ingestion Log Model to be shared
class IngestionLogBase(Base):
    __abstract__ = True
    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    status = Column(String(50), default="COMPLETED") # COMPLETED, FAILED, WARNING
    total_rows = Column(Integer, default=0)
    valid_rows = Column(Integer, default=0)
    invalid_rows = Column(Integer, default=0)
    duplicates = Column(Integer, default=0)
    quality_score = Column(Float, default=100.0)
    confidence_level = Column(String(50), default="HIGH") # HIGH, MEDIUM, LOW
    error_summary = Column(Text, nullable=True)
    ingested_at = Column(DateTime, default=datetime.utcnow)

class IngestionEngine:
    @staticmethod
    def normalize_columns(columns: List[str]) -> List[str]:
        normalized = []
        for col in columns:
            col_str = str(col).strip().lower()
            # Replace spaces and special chars with underscores
            col_str = re.sub(r'[\s\-/\\]+', '_', col_str)
            col_str = re.sub(r'[^\w]+', '', col_str)
            normalized.append(col_str)
        return normalized

    @classmethod
    def parse_file(cls, file_content: bytes, filename: str, expected_schemas: Dict[str, List[str]]) -> Dict[str, Any]:
        """
        Parses a CSV/XLS/XLSX file, normalizes headers, detects the closest schema,
        validates rows, checks duplicates, and calculates a quality score.
        """
        ext = os.path.splitext(filename)[1].lower()
        
        # 1. Read the file
        try:
            if ext == '.csv':
                df = pd.read_csv(BytesIO(file_content))
            elif ext in ['.xls', '.xlsx']:
                df = pd.read_excel(BytesIO(file_content))
            else:
                raise ValueError(f"Unsupported file extension: {ext}")
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to read file: {str(e)}",
                "total_rows": 0,
                "valid_rows": 0,
                "invalid_rows": 0,
                "duplicates": 0,
                "quality_score": 0.0,
                "confidence_level": "LOW"
            }

        total_rows = len(df)
        if total_rows == 0:
            return {
                "success": True,
                "data": [],
                "schema_detected": "unknown",
                "total_rows": 0,
                "valid_rows": 0,
                "invalid_rows": 0,
                "duplicates": 0,
                "quality_score": 100.0,
                "confidence_level": "HIGH",
                "errors": ["File is empty"]
            }

        # 2. Normalize columns
        original_cols = df.columns.tolist()
        normalized_cols = cls.normalize_columns(original_cols)
        df.columns = normalized_cols

        # Replace NaN with None for SQLAlchemy safety
        df = df.replace({np.nan: None})

        # 3. Schema Detection
        # Match against expected schemas based on overlap percentage
        best_schema = "unknown"
        best_overlap = 0.0
        
        for schema_name, req_cols in expected_schemas.items():
            normalized_req = cls.normalize_columns(req_cols)
            match_count = sum(1 for c in normalized_req if c in normalized_cols)
            overlap = match_count / len(normalized_req) if normalized_req else 0
            if overlap > best_overlap:
                best_overlap = overlap
                best_schema = schema_name

        # If overlap is extremely poor, default to first schema or generic
        if best_overlap < 0.2:
            best_schema = list(expected_schemas.keys())[0] if expected_schemas else "unknown"

        # Get expected columns for the detected schema
        expected_cols = expected_schemas.get(best_schema, [])
        normalized_req = cls.normalize_columns(expected_cols)

        # 4. Ingestion Metrics & Row validation
        valid_rows = []
        invalid_rows_count = 0
        duplicate_count = 0
        errors = []

        seen_keys = set()
        
        for idx, row in df.iterrows():
            row_dict = row.to_dict()
            
            # Basic validation: check if required fields (any of the main expected columns) have values
            is_valid = True
            missing_cols = []
            
            # Simple heuristic: at least 50% of expected schema columns must be non-null,
            # and critical primary fields (e.g. first 2 columns of schema) must not be None
            critical_cols = normalized_req[:2] if len(normalized_req) >= 2 else normalized_req
            
            for cc in critical_cols:
                if cc not in row_dict or row_dict[cc] is None or str(row_dict[cc]).strip() == "":
                    is_valid = False
                    missing_cols.append(cc)
            
            if not is_valid:
                invalid_rows_count += 1
                errors.append(f"Row {idx+2}: Missing critical column(s) {missing_cols}")
                continue

            # Duplicate detection: create a hashable representation of primary keys or the whole row
            # Let's use critical columns for uniqueness if available, else whole row
            dup_key = tuple(row_dict.get(cc) for cc in critical_cols) if critical_cols else tuple(row_dict.values())
            if dup_key in seen_keys:
                duplicate_count += 1
                # Skip duplicate
                continue
            seen_keys.add(dup_key)
            valid_rows.append(row_dict)

        # 5. Quality & Confidence scoring
        # Subtract from 100 based on invalid rows, duplicates, and missing columns
        penalty = (invalid_rows_count / total_rows) * 60 if total_rows > 0 else 0
        penalty += (duplicate_count / total_rows) * 20 if total_rows > 0 else 0
        
        # Missing columns penalty
        missing_schema_cols = sum(1 for c in normalized_req if c not in normalized_cols)
        schema_penalty = (missing_schema_cols / len(normalized_req)) * 20 if normalized_req else 0
        
        quality_score = max(0.0, 100.0 - penalty - schema_penalty)
        
        if quality_score >= 90.0:
            confidence_level = "HIGH"
        elif quality_score >= 70.0:
            confidence_level = "MEDIUM"
        else:
            confidence_level = "LOW"

        status = "COMPLETED"
        if invalid_rows_count > 0 or duplicate_count > 0:
            status = "WARNING"
        if len(valid_rows) == 0:
            status = "FAILED"

        return {
            "success": True,
            "data": valid_rows,
            "schema_detected": best_schema,
            "total_rows": total_rows,
            "valid_rows": len(valid_rows),
            "invalid_rows": invalid_rows_count,
            "duplicates": duplicate_count,
            "quality_score": round(quality_score, 2),
            "confidence_level": confidence_level,
            "status": status,
            "error_summary": "; ".join(errors[:5]) + (f" (and {len(errors)-5} more...)" if len(errors) > 5 else "") if errors else None
        }
