import subprocess
import sys

def install(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

print(f"Installing to: {sys.executable}")
install("requests")
install("pandas")
install("python-louvain")
install("networkx")
install("plotly")
install("matplotlib")

print("\n--- TEST ---")
try:
    import community
    print("Success! 'community' (louvain) is now reachable.")
except ImportError:
    print("Failed. We need to check your system PATH.")