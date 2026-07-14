import asyncio
from app.db.base import AsyncSessionLocal, init_db
from app.api.v1.endpoints.runtime import get_applications

async def test():
    await init_db()
    async with AsyncSessionLocal() as session:
        try:
            res = await get_applications(db=session)
            print("RESULT COUNT:", len(res))
            print("FIRST APPLICATION:", res[0] if res else "None")
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(test())
