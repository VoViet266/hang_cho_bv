using System.Data;
using Npgsql;

namespace HangChoKhamBenh.Web.Data;

public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}

public class NpgsqlConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public NpgsqlConnectionFactory(IConfiguration configuration)
    {
        var rawConn = configuration.GetConnectionString("DefaultConnection") 
                      ?? configuration["DATABASE_URL"] 
                      ?? string.Empty;

        _connectionString = ConvertToNpgsqlConnectionString(rawConn);
    }

    public IDbConnection CreateConnection()
    {
        var conn = new NpgsqlConnection(_connectionString);
        conn.Open();
        return conn;
    }

    public static string ConvertToNpgsqlConnectionString(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;

        if (input.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) ||
            input.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(input);
            var userInfo = uri.UserInfo.Split(':');
            var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "";
            var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
            var database = uri.AbsolutePath.TrimStart('/');
            var port = uri.Port > 0 ? uri.Port : 5432;
            var host = uri.Host;

            // Parse schema if present in query string
            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            var schema = query["schema"] ?? "current";

            var builder = new NpgsqlConnectionStringBuilder
            {
                Host = host,
                Port = port,
                Database = database,
                Username = username,
                Password = password,
                SearchPath = schema,
                Pooling = true
            };

            return builder.ConnectionString;
        }

        return input;
    }
}
