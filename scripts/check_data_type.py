import requests
import json

def check_leads():
    try:
        r = requests.get("http://localhost:8000/api/leads?limit=5")
        if r.status_code != 200:
            print(f"Error: {r.status_code}")
            return
            
        data = r.json()
        print(f"Fetched {len(data)} leads.")
        if data:
            first = data[0]
            custom = first.get("custom_data")
            print(f"Custom Data Type: {type(custom)}")
            print(f"Custom Data Content: {custom}")
            
            if isinstance(custom, str):
                print("WARNING: Custom Data is a STRING. Frontend will fail!")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    check_leads()
