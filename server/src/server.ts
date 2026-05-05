import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());
const secret = process.env.JWT_SECRET || 'dev_secret_change';
const sign = (u:any)=>jwt.sign({id:u.id,role:u.role,name:u.name,email:u.email}, secret, {expiresIn:'7d'});
const auth=async(req:any,res:any,next:any)=>{try{const t=req.cookies.token; if(!t) return res.status(401).json({message:'Unauthorized'}); req.user=jwt.verify(t,secret); next();}catch{return res.status(401).json({message:'Unauthorized'})}};
const roles=(...r:Role[])=>(req:any,res:any,next:any)=>r.includes(req.user.role)?next():res.status(403).json({message:'Forbidden'});
const createTest=process.env.CREATE_TEST_ACCOUNTS==='true' && process.env.NODE_ENV!=='production';
const createData=process.env.CREATE_TEST_DATA==='true' && process.env.NODE_ENV!=='production';

async function bootstrap(){
 if(createTest){for (const u of [['Super Admin','superadmin@restaurant.com','super_admin'],['Admin','admin@restaurant.com','admin'],['Waiter','waiter@restaurant.com','waiter']] as const){const exists=await prisma.user.findUnique({where:{email:u[1]}}); if(!exists) await prisma.user.create({data:{name:u[0],email:u[1],passwordHash:await bcrypt.hash('12345678',10),role:u[2] as Role}})}}
 if(createData){await prisma.setting.upsert({where:{id:1},update:{},create:{id:1,restaurantName:'Oson Restaurant',phone:'+998 90 123 45 67',address:'Xorazm, Uzbekistan',workingHours:'09:00 - 23:00',currency:'UZS',serviceFeePercent:0}})}
}

app.get('/api/auth/setup-status', async (_req,res)=>{const sa=await prisma.user.findFirst({where:{role:'super_admin'}});res.json({requiresSetup:!sa && !createTest});});
app.post('/api/auth/setup', async(req,res)=>{const s=z.object({name:z.string().min(1),email:z.string().email(),password:z.string().min(8),confirmPassword:z.string()}).refine(d=>d.password===d.confirmPassword);const d=s.parse(req.body);const sa=await prisma.user.findFirst({where:{role:'super_admin'}});if(sa) return res.status(400).json({message:'Already setup'}); const exists=await prisma.user.findUnique({where:{email:d.email}}); if(exists) return res.status(400).json({message:'Email exists'}); await prisma.user.create({data:{name:d.name,email:d.email,passwordHash:await bcrypt.hash(d.password,10),role:'super_admin'}});res.json({ok:true});});
app.post('/api/auth/login', async(req,res)=>{const d=z.object({email:z.string().email(),password:z.string().min(1)}).parse(req.body);const user=await prisma.user.findUnique({where:{email:d.email}}); if(!user||!user.isActive||!(await bcrypt.compare(d.password,user.passwordHash))) return res.status(400).json({message:'Invalid credentials'});res.cookie('token',sign(user),{httpOnly:true,sameSite:'lax'});res.json({id:user.id,name:user.name,role:user.role,email:user.email});});
app.get('/api/auth/me',auth,(req:any,res)=>res.json(req.user)); app.post('/api/auth/logout',(_req,res)=>{res.clearCookie('token');res.json({ok:true});});

app.get('/api/users',auth,roles('super_admin','admin'),async(req:any,res)=>{const users=await prisma.user.findMany({where:req.user.role==='admin'?{role:'waiter'}:{},select:{id:true,name:true,email:true,role:true,isActive:true}});res.json(users)});
app.post('/api/users',auth,roles('super_admin','admin'),async(req:any,res)=>{const d=z.object({name:z.string().min(1),email:z.string().email(),password:z.string().min(8),role:z.enum(['admin','waiter'])}).parse(req.body);if(req.user.role==='admin'&&d.role!=='waiter') return res.status(403).json({message:'Forbidden'});const u=await prisma.user.create({data:{name:d.name,email:d.email,passwordHash:await bcrypt.hash(d.password,10),role:d.role}});res.json(u)});
app.patch('/api/users/:id/status',auth,roles('super_admin','admin'),async(req:any,res)=>{const id=+req.params.id; const u=await prisma.user.findUnique({where:{id}}); if(!u) return res.sendStatus(404); if(req.user.role==='admin'&&u.role!=='waiter') return res.sendStatus(403); res.json(await prisma.user.update({where:{id},data:{isActive:!!req.body.isActive}}))});
app.delete('/api/users/:id',auth,roles('super_admin','admin'),async(req:any,res)=>{const id=+req.params.id;await prisma.user.delete({where:{id}});res.json({ok:true})});
app.put('/api/users/:id',auth,roles('super_admin','admin'),async(req:any,res)=>{const id=+req.params.id;res.json(await prisma.user.update({where:{id},data:req.body}))});

for (const r of ['categories','products','tables'] as const){app.get('/api/'+r,auth,async(_req,res)=>res.json(await (prisma as any)[r.slice(0,-1)==='categorie'?'category':r.slice(0,-1)].findMany()));}
app.get('/api/categories',auth,async(_req,res)=>res.json(await prisma.category.findMany({orderBy:{sortOrder:'asc'}})));
app.post('/api/categories',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.category.create({data:req.body})));
app.put('/api/categories/:id',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.category.update({where:{id:+req.params.id},data:req.body})));
app.delete('/api/categories/:id',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.category.delete({where:{id:+req.params.id}})));
app.patch('/api/categories/:id/status',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.category.update({where:{id:+req.params.id},data:{isActive:req.body.isActive}})));
app.get('/api/products',auth,async(_req,res)=>res.json(await prisma.product.findMany()));
app.post('/api/products',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.product.create({data:req.body})));
app.put('/api/products/:id',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.product.update({where:{id:+req.params.id},data:req.body})));
app.delete('/api/products/:id',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.product.delete({where:{id:+req.params.id}})));
app.patch('/api/products/:id/availability',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.product.update({where:{id:+req.params.id},data:{isAvailable:req.body.isAvailable}})));
app.get('/api/tables',auth,async(_req,res)=>res.json(await prisma.table.findMany()));
app.post('/api/tables',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.table.create({data:req.body})));
app.put('/api/tables/:id',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.table.update({where:{id:+req.params.id},data:req.body})));
app.delete('/api/tables/:id',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.table.delete({where:{id:+req.params.id}})));
app.patch('/api/tables/:id/status',auth,roles('super_admin','admin'),async(req,res)=>res.json(await prisma.table.update({where:{id:+req.params.id},data:{status:req.body.status}})));

app.get('/api/orders',auth,async(req:any,res)=>res.json(await prisma.order.findMany({where:req.user.role==='waiter'?{waiterId:req.user.id}:{},include:{items:true},orderBy:{createdAt:'desc'}})));
app.post('/api/orders',auth,roles('waiter','admin','super_admin'),async(req:any,res)=>{const body=req.body;const order=await prisma.order.create({data:{orderNumber:'ORD-'+Date.now(),tableNumber:body.tableNumber,waiterId:req.user.id,waiterName:req.user.name,totalPrice:body.totalPrice,note:body.note,items:{create:body.items}},include:{items:true}});await prisma.table.updateMany({where:{tableNumber:body.tableNumber},data:{status:'busy'}});res.json(order)});
app.get('/api/orders/:id',auth,async(req,res)=>res.json(await prisma.order.findUnique({where:{id:+req.params.id},include:{items:true}})));
app.patch('/api/orders/:id/status',auth,async(req:any,res)=>{const o=await prisma.order.findUnique({where:{id:+req.params.id}}); if(!o) return res.sendStatus(404); if(req.user.role==='waiter' && !(o.waiterId===req.user.id && o.status==='ready'&&req.body.status==='served')) return res.sendStatus(403); const updated=await prisma.order.update({where:{id:o.id},data:{status:req.body.status}});res.json(updated)});
app.patch('/api/orders/:id/cash-collected',auth,async(req:any,res)=>{const o=await prisma.order.findUnique({where:{id:+req.params.id}}); if(!o) return res.sendStatus(404); if(req.user.role==='waiter'&&o.waiterId!==req.user.id) return res.sendStatus(403); res.json(await prisma.order.update({where:{id:o.id},data:{paymentStatus:'cash_collected',cashCollectedByWaiterId:req.user.id,cashCollectedByWaiterName:req.user.name,cashCollectedAt:new Date(),cashCollectionNote:req.body.note||null}}))});
app.patch('/api/orders/:id/verify-payment',auth,roles('admin','super_admin'),async(req:any,res)=>res.json(await prisma.order.update({where:{id:+req.params.id},data:{paymentStatus:'paid',paymentVerifiedByAdminId:req.user.id,paymentVerifiedByAdminName:req.user.name,paymentVerifiedAt:new Date()}})));
app.patch('/api/orders/:id/payment-status',auth,roles('super_admin'),async(req,res)=>res.json(await prisma.order.update({where:{id:+req.params.id},data:{paymentStatus:req.body.paymentStatus}})));
app.get('/api/settings',auth,async(_req,res)=>res.json(await prisma.setting.findUnique({where:{id:1}})));
app.put('/api/settings',auth,roles('super_admin'),async(req,res)=>res.json(await prisma.setting.upsert({where:{id:1},update:req.body,create:{id:1,...req.body}})));
app.get('/api/statistics/overview',auth,roles('admin','super_admin'),async(_req,res)=>{const paid=await prisma.order.aggregate({where:{paymentStatus:'paid',status:{not:'cancelled'}},_sum:{totalPrice:true},_count:true});res.json({paidRevenue:paid._sum.totalPrice||0,paidOrders:paid._count})});
app.get('/api/statistics/revenue',auth,roles('admin','super_admin'),async(_req,res)=>res.json({}));app.get('/api/statistics/best-selling-products',auth,roles('admin','super_admin'),async(_req,res)=>res.json([]));app.get('/api/statistics/payments',auth,roles('admin','super_admin'),async(_req,res)=>res.json({}));

app.use((err:any,_req:any,res:any,_next:any)=>{res.status(400).json({message:err.message||'Error'})});
bootstrap().then(()=>app.listen(process.env.PORT||5000,()=>console.log('server started')));
