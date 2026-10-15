namespace HangChoKhamBenh.Web.Helpers
{
    public static class DateTimeHelper
    {
        public const string VietnamTimeZoneId = "Asia/Ho_Chi_Minh";

        public static void ConfigureTimeZone()
        {
            // Set before logging, DateTime.Now/Today and Npgsql initialize their local zone.
            Environment.SetEnvironmentVariable("TZ", VietnamTimeZoneId);
            TimeZoneInfo.ClearCachedData();
        }

        public static DateTime? ToDateTimeNullable(object? val)
        {
            if (val == null || val is DBNull) return null;
            if (val is DateTime dt) return dt;
            if (val is DateOnly d) return d.ToDateTime(TimeOnly.MinValue);
            if (DateTime.TryParse(val.ToString(), out var parsed)) return parsed;
            return null;
        }
    }
}
