# SSL certificate
aws acm import-certificate --certificate fileb:///Users/Connor/Downloads/demo.meiliconnor.online/certificate.crt \
--private-key fileb:///Users/Connor/Downloads/demo.meiliconnor.online/private.key \
--certificate-chain fileb:///Users/Connor/Downloads/demo.meiliconnor.online/ca_bundle.crt
