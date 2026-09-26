using Microsoft.EntityFrameworkCore;
using HangChoKhamBenh.Web.Data.Entities;

namespace HangChoKhamBenh.Web.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public virtual DbSet<DmPhong> DmPhong => Set<DmPhong>();
        public virtual DbSet<DmBenhNhan> DmBenhNhan => Set<DmBenhNhan>();
        public virtual DbSet<PsDangKy> PsDangKy => Set<PsDangKy>();
        public virtual DbSet<KhamBenh> KhamBenh => Set<KhamBenh>();
        public virtual DbSet<HangChoCdhaTmd> HangChoCdhaTmd => Set<HangChoCdhaTmd>();
        public virtual DbSet<HangChoDuocTmd> HangChoDuocTmd => Set<HangChoDuocTmd>();
        public virtual DbSet<ChungTu> ChungTu => Set<ChungTu>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.HasDefaultSchema("current");

            modelBuilder.Entity<DmPhong>(entity =>
            {
                entity.ToTable("dmphong", "current");
                entity.HasKey(e => e.Maphong);
            });

            modelBuilder.Entity<DmBenhNhan>(entity =>
            {
                entity.ToTable("dmbenhnhan", "current");
                entity.HasKey(e => e.Mabn);
            });

            modelBuilder.Entity<PsDangKy>(entity =>
            {
                entity.ToTable("psdangky", "current");
                entity.HasKey(e => new { e.Makb, e.Mabn });
            });

            modelBuilder.Entity<KhamBenh>(entity =>
            {
                entity.ToTable("khambenh", "current");
                entity.HasKey(e => new { e.Makb, e.Mabn });
            });

            modelBuilder.Entity<HangChoCdhaTmd>(entity =>
            {
                entity.ToTable("hangchocdha_tmd", "current");
                entity.HasNoKey();
            });

            modelBuilder.Entity<HangChoDuocTmd>(entity =>
            {
                entity.ToTable("hangchoduoc_tmd", "current");
                entity.HasNoKey();
            });

            modelBuilder.Entity<ChungTu>(entity =>
            {
                entity.ToTable("chungtu", "current");
                entity.HasNoKey();
            });
        }
    }
}
