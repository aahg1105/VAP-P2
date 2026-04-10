export class objectGUI{
    device: GPUDevice;
    tag: string;

    tx = 0; ty = 0; tz = 0;
    rx = 0; ry = 0; rz = 0;
    sx = 1; sy = 1; sz = 1;

    quaternion: number[] = [1,0,0,0];

    ambient = 0.12;
    diffuse = 0.75;
    specular = 0.60;
    shininess = 32;

    // crear variables de los sliders de la GUI

    vertexBuffer: GPUBuffer; // matriz mvp
    vertexCount: number;

    texture: GPUTexture;

    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;

    constructor(device: GPUDevice, data: Float32Array, tag: string, pipeline: GPURenderPipeline, sampler: GPUSampler, texture: GPUTexture){
        this.device = device;
        this.tag = tag;

        this.vertexCount = data.length / 11;

        this.texture = texture;

        this.vertexBuffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this.uniformBuffer = this.device.createBuffer({
            size: 288,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{binding: 0, resource: {buffer: this.uniformBuffer}}, 
                    {binding: 1, resource: sampler}, 
                    {binding: 2, resource: this.texture.createView()},],
        });

        this.device.queue.writeBuffer(this.vertexBuffer,0,data as any);
    }

    update(sampler: GPUSampler, texture: GPUTexture, pipeline: GPURenderPipeline){
        this.texture = texture;
        this.bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{binding: 0, resource: {buffer: this.uniformBuffer}}, 
                    {binding: 1, resource: sampler}, 
                    {binding: 2, resource: this.texture.createView()},],
        });
    }

    draw(pass: GPURenderPassEncoder, uArrayBuf: ArrayBuffer){
        this.device.queue.writeBuffer(this.uniformBuffer,0,uArrayBuf);

        pass.setBindGroup(0,this.bindGroup);
        pass.setVertexBuffer(0,this.vertexBuffer);
        pass.draw(this.vertexCount);
    }
}
