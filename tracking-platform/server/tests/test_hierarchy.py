# Prueba de extremo a extremo de la jerarquía multinivel contra un servidor recién instalado (base de datos vacía).
# Uso: TRACCAR_URL=http://127.0.0.1:8082 python3 test_hierarchy.py
import json, urllib.request, urllib.parse, http.cookiejar, sys, time
import os
BASE=os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
OSMAND=os.environ.get('OSMAND_URL', 'http://127.0.0.1:5055')
results=[]
class Client:
    def __init__(s):
        s.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), urllib.request.ProxyHandler({}))
    def req(s, method, path, body=None, form=None):
        data=None; headers={}
        if body is not None: data=json.dumps(body).encode(); headers['Content-Type']='application/json'
        if form is not None: data=urllib.parse.urlencode(form).encode(); headers['Content-Type']='application/x-www-form-urlencoded'
        r=urllib.request.Request(BASE+path, data=data, method=method, headers=headers)
        try:
            resp=s.op.open(r); txt=resp.read().decode(); return resp.status, (json.loads(txt) if txt else None)
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()[:200]
    def login(s, email, pw='secret123'):
        st,_=s.req('POST','/api/session', form={'email':email,'password':pw}); assert st==200,(email,st,_); return s
def check(name, cond, detail=''):
    results.append((name,cond)); print(('PASS ' if cond else 'FAIL ')+name+(' -- '+str(detail) if not cond else ''))

anon=Client()
st,admin_u=anon.req('POST','/api/users',{'name':'admin','email':'admin@test','password':'secret123'})
check('first user is admin', st==200 and admin_u['administrator'], (st,admin_u))
admin=Client().login('admin@test')
st,A=admin.req('POST','/api/users',{'name':'Gerente A','email':'a@test','password':'secret123','userLimit':-1,'deviceLimit':-1})
check('admin creates manager A', st==200, (st,A))
a=Client().login('a@test')
st,B=a.req('POST','/api/users',{'name':'Subgerente B','email':'b@test','password':'secret123','userLimit':10,'deviceLimit':50})
check('manager A creates sub-manager B with limits', st==200 and B['userLimit']==10, (st,B))
b=Client().login('b@test')
st,x=b.req('POST','/api/users',{'name':'X','email':'x@test','password':'secret123','deviceLimit':100})
check('B cannot grant deviceLimit above its own', st>=400, (st,x))
st,x=b.req('POST','/api/users',{'name':'X','email':'x2@test','password':'secret123','userLimit':-1})
check('B cannot grant unlimited users', st>=400, (st,x))
st,C=b.req('POST','/api/users',{'name':'Cliente C','email':'c@test','password':'secret123'})
check('B creates end user C', st==200, (st,C))
st,D=b.req('POST','/api/devices',{'name':'Camion 1','uniqueId':'860000000000001'})
check('B creates device', st==200, (st,D))
st,_=b.req('POST','/api/permissions',{'userId':C['id'],'deviceId':D['id']})
check('B links device to C', st==204, (st,_))
st,G=b.req('POST','/api/geofences',{'name':'Zona B','area':'CIRCLE (-12.05 -77.04, 500)'})
check('B creates geofence', st==200, (st,G))

st,ausers=a.req('GET','/api/users')
emails=sorted(u['email'] for u in ausers)
check('A sees whole subtree (B and C)', emails==['b@test','c@test'], emails)
st,adev=a.req('GET','/api/devices')
check('A sees device created by B', [d['name'] for d in adev]==['Camion 1'], adev)
st,ageo=a.req('GET','/api/geofences')
check('A sees geofence created by B', [g['name'] for g in ageo]==['Zona B'], ageo)
st,_=a.req('PUT',f"/api/users/{C['id']}",{**C,'name':'Cliente C editado'})
check('A can edit grandchild C', st==200, (st,_))

c=Client().login('c@test')
st,cdev=c.req('GET','/api/devices')
check('C sees only its device', [d['name'] for d in cdev]==['Camion 1'], cdev)
st,cu=c.req('GET','/api/users')
check('C sees no users', st==200 and cu==[], (st,cu))
st,_=b.req('GET',f"/api/users/{A['id']}")
check('B cannot read its manager A', st>=400, st)
st,bu=b.req('GET','/api/users')
check('B sees only C', sorted(u['email'] for u in bu)==['c@test'], bu)

st,_=admin.req('POST','/api/permissions',{'userId':C['id'],'managedUserId':A['id']})
check('cycle in hierarchy rejected', st>=400, (st,_))

st,_=a.req('PUT',f"/api/users/{A['id']}",{**A,'attributes':{'brand.title':'Flota A','brand.colorPrimary':'#0d47a1'}})
check('A saves brand', st==200, (st,_))
st,brand=c.req('GET','/api/hierarchy/brand')
check('C inherits brand of A', brand=={'title':'Flota A','colorPrimary':'#0d47a1'}, brand)
st,Bfull=b.req('GET','/api/session')
st,_=b.req('PUT',f"/api/users/{B['id']}",{**Bfull,'attributes':{'brand.title':'B Corp'}})
st,brand=c.req('GET','/api/hierarchy/brand')
check('closest manager brand wins, rest inherited', brand=={'title':'B Corp','colorPrimary':'#0d47a1'}, brand)
st,parents=a.req('GET','/api/hierarchy/parents')
check('direct managers resolved', parents.get(str(B['id']))==A['id'] and parents.get(str(C['id']))==B['id'], parents)

st,server=admin.req('GET','/api/server')
server['attributes']['brandDomains']=f"rastreo.bcorp.test={B['id']}"
st,_=admin.req('PUT','/api/server',server)
st,brand=anon.req('GET','/api/hierarchy/brand?host=rastreo.bcorp.test')
check('login page brand by domain', brand.get('title')=='B Corp', brand)
st,brand=anon.req('GET','/api/hierarchy/brand?host=otro.test')
check('unknown domain has no brand', brand=={}, brand)
st,_=b.req('PUT','/api/server',server)
check('manager cannot edit server (domain map)', st>=400, st)

# live position from device through the OsmAnd protocol
urllib.request.build_opener(urllib.request.ProxyHandler({})).open(f"{OSMAND}/?id=860000000000001&lat=-12.05&lon=-77.04&speed=20&timestamp={int(time.time())}").read()
for _ in range(30):
    time.sleep(1)
    st,apos=a.req('GET','/api/positions')
    if apos: break
check('A receives positions of subtree device', len(apos)==1 and abs(apos[0]['latitude']+12.05)<1e-6, apos)
st,cpos=c.req('GET','/api/positions')
check('C receives its device position', len(cpos)==1, cpos)

failed=[n for n,ok in results if not ok]
print(f"\n{len(results)-len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
