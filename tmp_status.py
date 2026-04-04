import json
from pathlib import Path
path=Path('runtime/execution-candidates.v1.json')
data=json.loads(path.read_text())
for candidate in data['candidates']:
    candidate['execution_status']='execution_completed'
data['candidates'][0]['execution_status']='awaiting_execution'
path.write_text(json.dumps(data, indent=2))
