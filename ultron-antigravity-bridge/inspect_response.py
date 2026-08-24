import inspect
import asyncio
from google.antigravity import Agent, LocalAgentConfig

async def main():
    print("Initializing agent...")
    config = LocalAgentConfig(system_instructions="You are a helpful assistant.")
    async with Agent(config) as agent:
        print("Sending chat...")
        response = await agent.chat("Hello!")
        print(f"\n--- {type(response).__name__} ---")
        for name, member in inspect.getmembers(type(response)):
            if not name.startswith('_'):
                print(f"  {name}: {type(member)}")

if __name__ == "__main__":
    asyncio.run(main())
