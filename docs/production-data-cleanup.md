# 운영 데이터 정리 체크리스트

운영에서 `APP_DATA_DIR=/var/lib/thecistus`처럼 앱 외부 데이터 경로를 쓰면, 저장소의 `data/content.json`을 정리해도 운영 데이터는 자동으로 바뀌지 않는다.

## 대상 파일

운영 기본 경로:

- `/var/lib/thecistus/content.json`
- `/var/lib/thecistus/content/*.json`
- `/var/lib/thecistus/comments.json`
- `/var/lib/thecistus/admin-auth.json`

## 테스트 콘텐츠 정리 방법

1. 운영 서버 접속 후 현재 데이터 백업

```bash
sudo cp -a /var/lib/thecistus /var/lib/thecistus.backup.$(date +%Y%m%d-%H%M%S)
```

2. 관리자 화면에서 테스트 글을 휴지통/영구 삭제하거나, 기본 콘텐츠로 복원

- 관리자 화면에서 직접 정리하는 방법을 우선한다.
- 기본값 복원은 현재 운영 콘텐츠를 덮어쓴다.

3. 파일 기준 확인

```bash
sudo jq -r '.portfolio[].title' /var/lib/thecistus/content.json
sudo jq -r '.categories[].label' /var/lib/thecistus/content/taxonomy.json
```

4. 앱 재시작이 필요한 경우

```bash
sudo systemctl restart thecistus-homepage
```

## 주의

- 댓글과 관리자 OTP 정책은 콘텐츠와 별도 파일이다.
- 운영 데이터는 저장소 커밋만으로 삭제되지 않는다.
