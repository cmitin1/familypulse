import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.upsert({
    where: { telegramId: "10001" },
    update: {},
    create: {
      telegramId: "10001",
      username: "owner_demo",
      firstName: "Owner"
    }
  });

  const member = await prisma.user.upsert({
    where: { telegramId: "10002" },
    update: {},
    create: {
      telegramId: "10002",
      username: "member_demo",
      firstName: "Member"
    }
  });

  const home = await prisma.home.create({
    data: {
      name: "Demo Family",
      timezone: "Europe/Moscow"
    }
  });

  await prisma.homeMember.upsert({
    where: { homeId_userId: { homeId: home.id, userId: owner.id } },
    create: { homeId: home.id, userId: owner.id, role: "OWNER" },
    update: {}
  });
  await prisma.homeMember.upsert({
    where: { homeId_userId: { homeId: home.id, userId: member.id } },
    create: { homeId: home.id, userId: member.id, role: "MEMBER" },
    update: {}
  });
  await prisma.user.update({ where: { id: owner.id }, data: { activeHomeId: home.id } });
  await prisma.user.update({ where: { id: member.id }, data: { activeHomeId: home.id } });

  await prisma.task.create({
    data: {
      homeId: home.id,
      title: "Купить продукты",
      points: 5,
      assigneeId: member.id
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
