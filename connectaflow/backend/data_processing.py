import polars as pl
from io import BytesIO

def read_csv_buffer(file_content: bytes) -> pl.DataFrame:
    try:
        df = pl.read_csv(BytesIO(file_content))
        return df
    except Exception as e:
        raise ValueError(f"Failed to read CSV: {str(e)}")

def process_enrichment_results(df: pl.DataFrame, new_data: list[dict], key_column: str = "url") -> pl.DataFrame:
    # Convert new data to DataFrame
    enrichment_df = pl.from_dicts(new_data)
    
    # Join with original dataframe
    # This assumes 'new_data' contains the key_column to join on
    if key_column not in df.columns:
        raise ValueError(f"Key column '{key_column}' not found in original data")
        
    result = df.join(enrichment_df, on=key_column, how="left")
    return result
