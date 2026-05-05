import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma=new PrismaClient();
async function main(){
 if(process.env.CREATE_TEST_ACCOUNTS==='true'&&process.env.NODE_ENV!=='production'){
  const users=[['Super Admin','superadmin@restaurant.com','super_admin'],['Admin','admin@restaurant.com','admin'],['Waiter','waiter@restaurant.com','waiter']] as const;
  for(const [name,email,role] of users){if(!(await prisma.user.findUnique({where:{email}}))){await prisma.user.create({data:{name,email,role:role as Role,passwordHash:await bcrypt.hash('12345678',10)}})}}
 }
}
main().finally(()=>prisma.$disconnect())
