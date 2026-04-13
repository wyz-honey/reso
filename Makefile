.PHONY: docker-build docker-up docker-down docker-logs

# 构建 API 与静态站点镜像（等价于 docker compose build）
docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f --tail=200
