#!/bin/bash
echo "Verifying Backend..."
curl -s http://localhost:8000/ | grep "Connectaflow Backend is running" && echo "Root: OK" || echo "Root: FAIL"
curl -s http://localhost:8000/api/leads/ | grep "\\[\\]" && echo "Leads List: OK" || echo "Leads List: FAIL"
echo "Done."
