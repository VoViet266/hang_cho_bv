AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
await QueueChecks.RunAsync();
