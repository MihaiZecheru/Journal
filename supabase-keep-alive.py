import requests

import os

# Helper to load .env file manually without external dependencies
def load_env_manually():
    for path in ["../.env", ".env", "server/.env"]:
        abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), path))
        if os.path.exists(abs_path):
            with open(abs_path, 'r') as f:
                for line in f:
                    if '=' in line and not line.startswith('#'):
                        parts = line.strip().split('=', 1)
                        if len(parts) == 2:
                            os.environ[parts[0].strip()] = parts[1].strip()

load_env_manually()

url = "https://fjzxcqdrvjvtiatfluqz.supabase.co/health"
apikey = os.environ.get("REACT_APP_SUPABASE_ANON_KEY") or ""

headers = {
    "apikey": apikey,
    "Authorization": f"Bearer {apikey}"
}

try:
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    print("Status Code:", response.status_code)
    print("Response:", response.text)
except requests.exceptions.RequestException as e:
    print("Error querying health endpoint:", e)
