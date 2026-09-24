# Multi-stage build for HangChoKhamBenh (.NET 8)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies first to cache restore layer
COPY HangChoKhamBenh.csproj ./
RUN dotnet restore "HangChoKhamBenh.csproj"

# Copy source code and publish
COPY . ./
RUN dotnet publish "HangChoKhamBenh.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    PORT=3002 \
    TZ=Asia/Ho_Chi_Minh

COPY --from=build /app/publish .

# Tạo thư mục logs và audio cache, tạo symlink public -> wwwroot để tương thích ngược
RUN mkdir -p /app/logs /app/wwwroot/audio/cache && \
    ln -s /app/wwwroot /app/public

EXPOSE 3002

ENTRYPOINT ["dotnet", "HangChoKhamBenh.dll"]
