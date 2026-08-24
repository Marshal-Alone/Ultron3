import inspect
from google.antigravity import Agent, LocalAgentConfig

def inspect_class(cls):
    print(f"\n--- {cls.__name__} ---")
    print(inspect.signature(cls.__init__))
    for name, member in inspect.getmembers(cls):
        if not name.startswith('_'):
            print(f"  {name}: {type(member)}")

print("Inspecting LocalAgentConfig...")
inspect_class(LocalAgentConfig)

print("\nInspecting Agent...")
inspect_class(Agent)

print("\nInspecting Agent.chat signature...")
if hasattr(Agent, 'chat'):
    print(inspect.signature(Agent.chat))
