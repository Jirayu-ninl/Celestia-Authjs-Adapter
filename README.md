
## Celestia - AuthJs Adapter

This adapter for AuthJs using 2 databases for storing data

- **Redis:** Server session
- **Prisma:** User, account, and other models

```
import { CelestiaAdapter } from  "@celestia/authjs-adapter"
import { prisma, redis } from "@/path/to/your/db"

const adapter = CelestiaAdapter(prisma, redis)
```