## 证书

### client

#### 私钥：



#### 公钥：



### server

#### 私钥



#### 公钥



## TLCP数据

### 第一部分

#### SKi

```
Asymmetric_Encrypt(Ski,pub_r)
SM2
```



#### ni

```
Symmetric_Encrypt(Ni,Ski)
SM4 CBC  IV值为16字节00
```



#### idi

```
Symmetric_Encrypt(IDi,Ski)
SM4 CBC  IV值为ni载荷密文最后16字节
```



#### SIGi_b

```
Asymmetric_Sign(Ski_b|Ni_b|IDi_b|CERT_enc_i_b,priv_i)
sm2签名
CERT_enc_i_b证书值包含了 证书前面一个字节（可能为05）  只需要去掉 开头的 下一个载荷|保留字段(00)|长度（2字节）即可  怀疑在IPSEC标准中所有结尾是 _b的数据包提取部分都是这个规律
```



#### SKr

```
Asymmetric_Encrypt(Skr,pub_i)
SM2
```



#### nr

```
Symmetric_Encrypt(Nr,Skr)
SM4 CBC  IV值为16字节00
```



#### idr

```
Symmetric_Encrypt(IDr,Skr)
SM4 CBC  IV值为nr载荷密文最后16字节
```



#### SIGi_b

```
Asymmetric_Sign(Skr_b|Nr_b|IDr_b|CERT_enc_r_b,priv_r)
sm2签名
CERT_enc_r_b证书值包含了 证书前面一个字节（可能为05）  只需要去掉 开头的 下一个载荷|保留字段(00)|长度（2字节）即可  怀疑在IPSEC标准中所有结尾是 _b的数据包提取部分都是这个规律
```





### 第二部分

#### CKY-I

> 指I-SPI



#### CKY-R

> 指R-SPI



#### SKEYID

```
SKEYID=PRF(HASH(Ni_b|Nr_b),CKY-I|CKY-R)
HASH:SM3
PRF:HMAC(key,msg)
```



#### SKEYID_d

```
SKEYID_d=PRF(SKEYID,CKY-I|CKY-R|0)
```



#### SKEYID_a

```
SKEYID_a=PRF(SKEYID,SKEYID_d|CKY-I|CKY-R|1)
```



#### SKEYID_e

```
SKEYID_e=PRF(SKEYID,SKEYID_a|CKY-I|CKY-R|2)
注意SKEYID_e为加密工作密钥 因为一般是sm4的密钥 所以经常截取前16字节使用
```





#### HASHi（消息5的密文部分）

```
IV= HASH(Ski_b|Skr_b)
明文格式：4字节长度（4字节本身+hashi的长度）|hashi|填充值（全00填充）
HASHi=PRF(SKEYID,CKY-I|CKY-R|SAi_b|IDi_b)
注意SAI_b 在IPSEC中带_b的协议消息数据的引用说明要去除开头的4字节 也就是Next payload|reserved|payload length这三个部分 可能意思是这三个部分是IPSEC的通用消息内容 而不是SAI的载荷消息 感觉这个判断依据可能是各个协议之间通用的
```



#### HASHR（消息6的密文部分）

```
IV= hashi密文部分最后16字节（反正就是上一个数据包的后16字节）
HASHr=PRF(SKEYID,CKY-R|CKY-I|SAr_b|IDr_b)
```





### 快速模式

> 在快速模式中,一个HASH载荷应紧跟在ISAKMP头之后,这个HASH用于消息的 完整性校验以及数据源身份验证。
>
> 在第二阶段,载荷的加密使用对称密码算法的CBC工作模式,第1个消息的IV是第一阶段的最后一组密文和第二阶段的MsgID进行HASH运算所得到的: IV=HASH(第一阶段的最后一组密文|MsgID)
>
> 后续的IV是前一个消息的最后一组密文。消息的填充和第一阶段中的填充方式一样。
>

**通用载荷结构** 

| 下一个载荷 | 保留            | 载荷长度                                                     |
| ---------- | --------------- | ------------------------------------------------------------ |
| 1字节      | 1字节（默认00） | 长度为2字节,长度数值以字节为单位,计算范围包含通用载荷头在内的整个载荷长度。 |



#### quick 1

```
IV=HASH(第一阶段的最后一组密文|MsgID)
```



#### quick 2

```
IV是前一个消息的最后一组密文
```



#### quick 3

```
IV是前一个消息的最后一组密文
```

