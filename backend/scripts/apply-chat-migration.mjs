import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
try{
 const tables=await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ProjectChat','ChatMessage','ChatFile')`;
 if(tables.length===3)console.log('El esquema de chat temporal ya está instalado.');
 else if(tables.length)throw new Error('El esquema de chat está incompleto; no se aplicaron cambios.');
 else{const sql=await readFile(new URL('../prisma/migrations/20260910170000_weekly_project_chat/migration.sql',import.meta.url),'utf8');await prisma.$transaction(async tx=>{for(const statement of sql.split(';').map(value=>value.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);},{timeout:30000});console.log('Tablas de chat temporal agregadas. Los datos existentes se conservaron.');}
}finally{await prisma.$disconnect();}
